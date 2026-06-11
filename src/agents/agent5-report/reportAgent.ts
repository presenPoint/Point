/**
 * Agent 5 — Report & Analytics. Spec: ./AGENT.md
 */
import { chatJson, hasOpenAI } from '../../lib/openai';
import type {
  ActionableFeedback,
  PersonaStyleCoaching,
  ReportScores,
  SessionContext,
} from '../../types/session';
import type { Persona } from '../../constants/personas';
import { analyzeContext, type ContextAnalysisResult } from './contextAnalysis';
import { buildPresentationTopicBlock } from '../../lib/presentationTopicContext';
import { transcriptPlain } from '../../lib/transcriptScript';
import { getPersonaPaceRange, type PaceRange } from '../../lib/speechRate';
import { resolveLocaleForCurrentApp, type AppLocale } from '../../store/localeStore';
import { aiOutputLanguageRule, deepLocaleOk, sanitizeKoUserFacingDeep } from '../../lib/aiOutputLocale';
import { liftReportScore, SCORE_TUNING } from '../../lib/scoreTuning';
import { suggestTranscriptPolish } from '../transcriptPolishAgent';

function tsToLabel(ts: number, sessionStart: number): string {
  const elapsed = Math.max(0, Math.round((ts - sessionStart) / 1000));
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return `${m}m${String(s).padStart(2, '0')}s`;
}

function calcCoherenceScore(sc: SessionContext['speech_coaching']): number {
  const checks = sc.semantic_check_count ?? 0;
  const passes = sc.coherence_pass_count ?? 0;
  const breaks = sc.logic_break_log?.length ?? 0;
  if (checks === 0) return 70;

  const passRate = passes / checks;
  const score = Math.round(passRate * 100);
  const repeatPenalty = Math.min(35, breaks * SCORE_TUNING.logicBreakPenaltyPer);
  return Math.max(0, score - repeatPenalty);
}

function calcPaceScore(paceLog: { wpm: number }[], paceRange?: PaceRange): number {
  if (paceLog.length === 0) return 70;
  const [min, max] = paceRange
    ? [paceRange.min, paceRange.max]
    : paceRange === undefined
      ? [130, 170]
      : [250, 350];
  const inRange = paceLog.filter((e) => e.wpm >= min && e.wpm <= max).length;
  return Math.round((inRange / paceLog.length) * 100);
}

interface GazeBreakInfo {
  durationMs: number;
  direction: 'left' | 'right' | 'center' | 'mixed';
}

function analyzeGazeBreaks(gazeLog: { is_gazing: boolean; direction: 'center' | 'left' | 'right'; timestamp: number }[]): GazeBreakInfo[] {
  const breaks: GazeBreakInfo[] = [];
  let inBreak = false;
  let breakStartIdx = 0;

  for (let i = 0; i <= gazeLog.length; i++) {
    const isGazing = i < gazeLog.length ? gazeLog[i].is_gazing : true;

    if (!isGazing && !inBreak) {
      inBreak = true;
      breakStartIdx = i;
    } else if (isGazing && inBreak) {
      const segment = gazeLog.slice(breakStartIdx, i);
      const leftCount = segment.filter((e) => e.direction === 'left').length;
      const rightCount = segment.filter((e) => e.direction === 'right').length;
      const durationMs = gazeLog[i - 1].timestamp - gazeLog[breakStartIdx].timestamp;

      let direction: GazeBreakInfo['direction'];
      if (leftCount + rightCount === 0) direction = 'center';
      else if (leftCount > rightCount * 2) direction = 'left';
      else if (rightCount > leftCount * 2) direction = 'right';
      else direction = 'mixed';

      breaks.push({ durationMs, direction });
      inBreak = false;
    }
  }

  return breaks;
}

function calcGazeScore(gazeLog: { is_gazing: boolean; direction: 'center' | 'left' | 'right'; timestamp: number }[]): number {
  if (gazeLog.length < 5) return 70;

  // ── Component 1: Gaze rate (0–60 pts) ────────────────────────────────────
  // 이상적 범위: 60–80%. 너무 낮으면(청중과 단절), 너무 높으면(불자연스러운 응시) 감점.
  const gazeRate = gazeLog.filter((e) => e.is_gazing).length / gazeLog.length;
  let rateScore: number;
  if (gazeRate >= 0.55 && gazeRate <= 0.85) {
    rateScore = 58;
  } else if (gazeRate > 0.85 && gazeRate <= 0.93) {
    rateScore = 58 - (gazeRate - 0.85) * 140; // 58→47
  } else if (gazeRate > 0.93) {
    rateScore = Math.max(28, 47 - (gazeRate - 0.93) * 200);
  } else if (gazeRate >= 0.35) {
    rateScore = 24 + (gazeRate - 0.35) * 194; // 24→58
  } else {
    rateScore = gazeRate * 55;
  }

  // ── Component 2: 이탈 패턴 (0–20 pts) ────────────────────────────────────
  // 짧고 자연스러운 이탈(1-3s)은 허용, 긴 이탈(>5s)과 잦은 이탈은 감점.
  const breaks = analyzeGazeBreaks(gazeLog);
  const longBreaks = breaks.filter((b) => b.durationMs > 5000);
  const veryLongBreaks = breaks.filter((b) => b.durationMs > 10000);
  const excessBreaks = Math.max(0, breaks.length - 18);

  const breakPenalty = Math.min(16,
    longBreaks.length * 3 +
    veryLongBreaks.length * 3 +
    excessBreaks,
  );
  const breakScore = 20 - breakPenalty;

  // ── Component 3: 방향 다양성 (0–10 pts) ──────────────────────────────────
  // 좌·우 양쪽을 골고루 보는 것은 청중 전체를 아우르는 자연스러운 스캐닝.
  const awayEntries = gazeLog.filter((e) => !e.is_gazing);
  const leftCount = awayEntries.filter((e) => e.direction === 'left').length;
  const rightCount = awayEntries.filter((e) => e.direction === 'right').length;

  let dirScore: number;
  if (awayEntries.length === 0) {
    dirScore = 5; // 이탈 없음: 중립
  } else if (leftCount > 0 && rightCount > 0) {
    // 양방향 시선: 균형일수록 만점
    const balance = Math.min(leftCount, rightCount) / Math.max(leftCount, rightCount);
    dirScore = Math.round(balance * 10);
  } else {
    dirScore = 4; // 한쪽만 바라봄 — 완전 0점 대신 소폭 감점
  }

  // ── Component 4: 시간적 일관성 (0–10 pts) ────────────────────────────────
  // 발표 전반에 걸쳐 시선 접촉이 고르게 분포되어야 함.
  const segCount = 4;
  const segSize = Math.floor(gazeLog.length / segCount);
  let consistencyScore: number;
  if (segSize > 0) {
    const segRates = Array.from({ length: segCount }, (_, i) => {
      const seg = gazeLog.slice(i * segSize, (i + 1) * segSize);
      return seg.filter((e) => e.is_gazing).length / seg.length;
    });
    const mean = segRates.reduce((a, b) => a + b, 0) / segCount;
    const variance = segRates.reduce((acc, v) => acc + (v - mean) ** 2, 0) / segCount;
    // 분산 0 → 10점, 분산 0.05 이상 → 0점
    consistencyScore = Math.max(0, Math.round(10 - variance * 200));
  } else {
    consistencyScore = 5;
  }

  const total = Math.round(rateScore + breakScore + dirScore + consistencyScore);
  return Math.max(0, Math.min(100, total));
}

function calcPostureScore(
  postureLog: { is_ok: boolean }[],
  dynamismLog: { level: string }[],
): number {
  if (postureLog.length === 0) return 75;
  const okRate = postureLog.filter((e) => e.is_ok).length / postureLog.length;
  const baseScore = Math.round(okRate * 100);

  if (dynamismLog.length === 0) return baseScore;

  const naturalRate = dynamismLog.filter((d) => d.level === 'natural').length / dynamismLog.length;
  const stiffRate = dynamismLog.filter((d) => d.level === 'stiff').length / dynamismLog.length;
  const restlessRate = dynamismLog.filter((d) => d.level === 'restless').length / dynamismLog.length;

  const dynamismScore = Math.round(naturalRate * 100);
  const stiffPenalty = Math.round(stiffRate * SCORE_TUNING.postureStiffPenaltyScale);
  const restlessPenalty = Math.round(restlessRate * SCORE_TUNING.postureRestlessPenaltyScale);

  return Math.max(0, Math.min(100, Math.round(
    baseScore * 0.5 + dynamismScore * 0.5 - stiffPenalty - restlessPenalty
  )));
}

function calcGestureScore(
  gestureLog: { type: string }[],
  durationSec: number,
  rhythmScore: number,
): number {
  const excess = gestureLog.filter((e) => e.type === 'excess').length;

  const excessPenalty = Math.min(32, excess * SCORE_TUNING.gestureExcessPenaltyPer);
  const freezePenalty = durationSec > 60 && gestureLog.length === 0 ? SCORE_TUNING.gestureFreezePenalty : 0;

  const base = Math.max(0, 100 - excessPenalty - freezePenalty);
  return Math.round(base * 0.6 + rhythmScore * 0.4);
}

export function calcCompositeScore(
  ctx: SessionContext,
  paceRange?: PaceRange,
): ReportScores & { contextAnalysis: ContextAnalysisResult } {
  const contextAnalysis = analyzeContext(ctx);

  const wpmScore = calcPaceScore(ctx.speech_coaching.wpm_log, paceRange);
  const fillerScore = Math.max(0, 100 - ctx.speech_coaching.filler_count * SCORE_TUNING.fillerPenaltyPer);
  const offTopicScore = Math.max(0, 100 - ctx.speech_coaching.off_topic_log.length * SCORE_TUNING.offTopicPenaltyPer);
  const ambiguousScore = Math.max(0, 100 - ctx.speech_coaching.ambiguous_count * SCORE_TUNING.ambiguousPenaltyPer);

  const coherenceScore = calcCoherenceScore(ctx.speech_coaching);

  const rawSpeechScore = Math.round(
    wpmScore * 0.22 +
      fillerScore * 0.22 +
      offTopicScore * 0.18 +
      ambiguousScore * 0.13 +
      coherenceScore * 0.25
  );
  const speechScore = liftReportScore(rawSpeechScore);

  const gazeScore = calcGazeScore(ctx.nonverbal_coaching.gaze_log);
  const postureScore = calcPostureScore(ctx.nonverbal_coaching.posture_log, ctx.nonverbal_coaching.dynamism_log);
  const gestureScore = calcGestureScore(
    ctx.nonverbal_coaching.gesture_log,
    ctx.speech_coaching.total_duration_sec,
    contextAnalysis.rhythmScore,
  );

  const rawNonverbalScore = Math.round(
    gazeScore * 0.35 + postureScore * 0.25 + gestureScore * 0.2 + contextAnalysis.contextScore * 0.2,
  );
  const nonverbalScore = liftReportScore(rawNonverbalScore);

  const qaSkipped = Boolean(ctx.qa_skipped);
  const qaScore = qaSkipped ? 0 : ctx.qa.final_score || 0;

  const compositeScore = qaSkipped
    ? Math.round((speechScore * 4 + nonverbalScore * 3) / 7)
    : Math.round(speechScore * 0.4 + nonverbalScore * 0.3 + qaScore * 0.3);

  return { compositeScore, speechScore, nonverbalScore, qaScore, contextAnalysis };
}

type ReportNarrative = {
  strengths: string[];
  improvements: ActionableFeedback[];
  persona_style_coaching?: PersonaStyleCoaching | null;
};

function formatInsightsForGPT(analysis: ContextAnalysisResult, sessionStart: number): string {
  const lines: string[] = [];

  lines.push(`[Cross-context Analysis]`);
  lines.push(`Gestures accompanying keyword speech: ${analysis.keywordGestureHits} / missed: ${analysis.keywordGestureMisses}`);
  lines.push(`Nervous fidgeting during filler words: ${analysis.fillerFidgetCount}`);
  lines.push(`Long freeze (30s+ no movement): ${analysis.freezeCount}`);
  lines.push(`Gesture rhythm score: ${analysis.rhythmScore}/100`);
  lines.push(`Context alignment score: ${analysis.contextScore}/100`);

  if (analysis.insights.length > 0) {
    lines.push('');
    lines.push('[Timestamped Observations — use these in your feedback]');
    for (const insight of analysis.insights.slice(0, 15)) {
      const timeLabel = insight.timestamp > 0 ? `[${tsToLabel(insight.timestamp, sessionStart)}]` : '[overall]';
      lines.push(`- ${timeLabel} ${insight.description}`);
    }
  }

  return lines.join('\n');
}

/** 업로드·입력된 원고가 있으면 계획 대본으로 취급 (임베딩과 동일하게 최소 길이) */
function hasScriptPlan(ctx: SessionContext): boolean {
  return ctx.material.script_text.trim().length >= 20;
}

function scriptPlanExcerpt(ctx: SessionContext, maxChars = 1500): string {
  const t = ctx.material.script_text.trim();
  if (!t) return '';
  return t.length > maxChars ? `${t.slice(0, maxChars)}…` : t;
}

function transcriptExcerpt(ctx: SessionContext, maxChars = 1800): string {
  const parts = ctx.speech_coaching.transcript_log
    .slice(-24)
    .map((e) => (typeof e.text === 'string' ? e.text : '').trim())
    .filter(Boolean);
  const joined = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (!joined) return '';
  return joined.length > maxChars ? joined.slice(-maxChars) : joined;
}

function fallbackPersonaStyleCoaching(persona: Persona, ctx: SessionContext, scores: ReportScores): PersonaStyleCoaching {
  const avgWpm =
    ctx.speech_coaching.wpm_log.length === 0
      ? 0
      : Math.round(
          ctx.speech_coaching.wpm_log.reduce((a, b) => a + b.wpm, 0) / ctx.speech_coaching.wpm_log.length,
        );
  const locale = resolveLocaleForCurrentApp();
  const pr = getPersonaPaceRange(persona.config, locale);
  const unit = pr.unit === 'spm' ? (locale === 'ko' ? '음절/분' : 'SPM') : 'WPM';
  const paceNote =
    avgWpm === 0
      ? locale === 'ko'
        ? '속도 데이터가 부족했어요—다음엔 코치 목표 구간에 맞춰 말하는 구간을 늘려 보세요.'
        : 'Pace data was thin this run—next time aim for the coach’s pace band in calmer segments.'
      : avgWpm >= pr.min && avgWpm <= pr.max
        ? locale === 'ko'
          ? `평균 말 속도(약 ${avgWpm} ${unit})가 이 코치 목표 ${pr.min}–${pr.max} ${unit} 안에 있었어요.`
          : `Average pace (~${avgWpm} ${unit}) sat inside this coach’s ${pr.min}–${pr.max} ${unit} band—good alignment.`
        : locale === 'ko'
          ? `평균 말 속도(약 ${avgWpm} ${unit})가 목표 ${pr.min}–${pr.max} ${unit} 밖이었어요—도입·전환에서 속도를 맞춰 보세요.`
          : `Average pace (~${avgWpm} ${unit}) drifted outside ${pr.min}–${pr.max} ${unit}—rehearse opening and transitions in that window.`;

  return {
    style_alignment: `${persona.name} (${persona.presentationInfo.archetype}) — ${paceNote} Composite score ${scores.compositeScore}/100.`,
    delivery_practices: persona.presentationInfo.principles.slice(0, 5),
    phrase_rewrites: [],
  };
}

/** 메인 리포트 JSON에 phrase_rewrites가 비었을 때 전사 기반으로 보충 */
export async function enrichPhraseRewritesIfMissing(
  coaching: PersonaStyleCoaching,
  persona: Persona,
  ctx: SessionContext,
): Promise<PersonaStyleCoaching> {
  if ((coaching.phrase_rewrites?.length ?? 0) > 0) return coaching;
  const plain = transcriptPlain(
    ctx.speech_coaching.transcript_log,
    ctx.speech_coaching.transcript_live_draft,
  );
  if (plain.length < 60 || !hasOpenAI()) return coaching;
  try {
    const pairs = await suggestTranscriptPolish(plain, {
      coachName: persona.name,
      personaSystemPrompt: persona.systemPrompt,
      locale: resolveLocaleForCurrentApp(),
    });
    if (!pairs?.length) return coaching;
    return {
      ...coaching,
      phrase_rewrites: pairs.slice(0, 5).map((p) => ({
        from_session: p.original,
        persona_aligned_example: p.improved,
        ...(p.note ? { why: p.note } : {}),
      })),
    };
  } catch (e) {
    console.warn('[Point] phrase_rewrites enrich skipped', e);
    return coaching;
  }
}

function normalizePersonaStyleCoaching(
  raw: PersonaStyleCoaching | null | undefined,
  persona: Persona,
  ctx: SessionContext,
  scores: ReportScores,
): PersonaStyleCoaching {
  if (!raw || typeof raw.style_alignment !== 'string' || !Array.isArray(raw.delivery_practices)) {
    return fallbackPersonaStyleCoaching(persona, ctx, scores);
  }
  const practices = raw.delivery_practices
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean)
    .slice(0, 6);
  const rewrites = Array.isArray(raw.phrase_rewrites)
    ? raw.phrase_rewrites
        .filter(
          (r): r is { from_session: string; persona_aligned_example: string; why?: string } =>
            r &&
            typeof r.from_session === 'string' &&
            typeof r.persona_aligned_example === 'string' &&
            r.from_session.trim().length > 0 &&
            r.persona_aligned_example.trim().length > 0,
        )
        .slice(0, 5)
        .map((r) => ({
          from_session: r.from_session.trim().slice(0, 280),
          persona_aligned_example: r.persona_aligned_example.trim().slice(0, 340),
          ...(typeof r.why === 'string' && r.why.trim()
            ? { why: r.why.trim().slice(0, 160) }
            : {}),
        }))
    : [];
  return {
    style_alignment: raw.style_alignment.trim().slice(0, 600) || fallbackPersonaStyleCoaching(persona, ctx, scores).style_alignment,
    delivery_practices: practices.length >= 2 ? practices : fallbackPersonaStyleCoaching(persona, ctx, scores).delivery_practices,
    phrase_rewrites: rewrites,
  };
}

function buildTimeline(ctx: SessionContext, sessionStart: number, paceRange?: PaceRange): string {
  const events: { ts: number; desc: string }[] = [];
  const fast = paceRange ? Math.round(paceRange.max * 1.12) : 350;
  const slow = paceRange ? Math.round(paceRange.min * 0.88) : 100;
  const unit = paceRange?.unit === 'spm' ? 'SPM' : 'WPM';

  for (const entry of ctx.speech_coaching.wpm_log) {
    if (entry.wpm > fast || (entry.wpm < slow && entry.wpm > 0)) {
      events.push({
        ts: entry.timestamp,
        desc: `Speech pace: ${entry.wpm} ${unit} (${entry.wpm > fast ? 'too fast' : 'too slow'})`,
      });
    }
  }

  for (const entry of ctx.speech_coaching.off_topic_log) {
    const ex = typeof entry.excerpt === 'string' ? entry.excerpt : '';
    const reason = typeof entry.reason === 'string' ? entry.reason : '';
    events.push({ ts: entry.timestamp, desc: `Off-topic: "${ex.slice(0, 60)}" — ${reason}` });
  }

  for (const ft of ctx.speech_coaching.filler_timestamps.slice(0, 10)) {
    events.push({ ts: ft, desc: 'Filler word detected' });
  }

  for (const g of ctx.nonverbal_coaching.gesture_log.slice(0, 15)) {
    events.push({ ts: g.timestamp, desc: `Gesture: ${g.type}` });
  }

  const postureIssues = ctx.nonverbal_coaching.posture_log.filter(p => !p.is_ok);
  if (postureIssues.length > 0) {
    const clusters: number[] = [];
    let lastTs = 0;
    for (const p of postureIssues) {
      if (p.timestamp - lastTs > 10_000) clusters.push(p.timestamp);
      lastTs = p.timestamp;
    }
    for (const ts of clusters.slice(0, 5)) {
      events.push({ ts, desc: 'Posture instability detected' });
    }
  }

  const dynamismIssues = ctx.nonverbal_coaching.dynamism_log.filter(d => d.level !== 'natural');
  if (dynamismIssues.length > 0) {
    const clusters: { ts: number; level: string }[] = [];
    let lastTs = 0;
    for (const d of dynamismIssues) {
      if (d.timestamp - lastTs > 15_000) clusters.push({ ts: d.timestamp, level: d.level });
      lastTs = d.timestamp;
    }
    for (const c of clusters.slice(0, 5)) {
      events.push({ ts: c.ts, desc: `Body movement: ${c.level}` });
    }
  }

  const gazeAway: number[] = [];
  let gazeLastTs = 0;
  for (const g of ctx.nonverbal_coaching.gaze_log.filter(g => !g.is_gazing)) {
    if (g.timestamp - gazeLastTs > 10_000) gazeAway.push(g.timestamp);
    gazeLastTs = g.timestamp;
  }
  for (const ts of gazeAway.slice(0, 5)) {
    events.push({ ts, desc: 'Eye contact lost' });
  }

  events.sort((a, b) => a.ts - b.ts);

  if (events.length === 0) return '';

  const lines = ['', '[Session Timeline — reference specific timestamps in your feedback]'];
  for (const ev of events.slice(0, 25)) {
    lines.push(`  ${tsToLabel(ev.ts, sessionStart)} — ${ev.desc}`);
  }
  return lines.join('\n');
}

export async function generateReportNarrative(
  ctx: SessionContext,
  scores: ReportScores & { contextAnalysis: ContextAnalysisResult },
  persona?: Persona | null,
  scriptCoverage?: number | null,
  /** 리포트 생성 시점 언어(미지정 시 현재 앱 설정) */
  outputLocale?: AppLocale,
): Promise<ReportNarrative> {
  const personaPrompt = persona?.systemPrompt;
  const avgWpm =
    ctx.speech_coaching.wpm_log.length === 0
      ? 0
      : Math.round(
          ctx.speech_coaching.wpm_log.reduce((a, b) => a + b.wpm, 0) /
            ctx.speech_coaching.wpm_log.length
        );

  const sessionStart = new Date(ctx.started_at).getTime();
  const locale = outputLocale ?? resolveLocaleForCurrentApp();
  const paceRange = persona ? getPersonaPaceRange(persona.config, locale) : undefined;
  const offExcerpts = ctx.speech_coaching.off_topic_log
    .map((e) => `[${tsToLabel(e.timestamp, sessionStart)}] "${typeof e.excerpt === 'string' ? e.excerpt : ''}"`)
    .join(' / ');
  const contextBlock = formatInsightsForGPT(scores.contextAnalysis, sessionStart);
  const timelineBlock = buildTimeline(ctx, sessionStart, paceRange);
  const durationMin = Math.round(ctx.speech_coaching.total_duration_sec / 60);

  const coachMeta = persona
    ? `Selected coaching persona: ${persona.name} (id: ${persona.id})\nArchetype: ${persona.presentationInfo.archetype}\nDomain fit: ${persona.presentationInfo.domainFit}`
    : 'Selected coaching persona: none (use generic executive-coach benchmark).';

  const topicBlock = buildPresentationTopicBlock(ctx);
  const topicMeta = topicBlock ? `${topicBlock}\n` : '';

  const speechExcerpt = transcriptExcerpt(ctx);
  const scriptPresent = hasScriptPlan(ctx);
  const planExcerpt = scriptPresent ? scriptPlanExcerpt(ctx) : '';

  // Script coverage (passed in from sessionStore after calcScriptCoverage)
  const scriptCoverageBlock = scriptCoverage != null
    ? `Script coverage: ${Math.round(scriptCoverage * 100)}% of planned script sections delivered`
    : '';

  // Script style summary
  const scriptStyleBlock = ctx.material.script_style
    ? `Script style: ${ctx.material.script_style.tone} tone, ${ctx.material.script_style.complexity} complexity, ~${ctx.material.script_style.estimatedMinutes} min planned`
    : '';

  const manuscriptVsSpeechBlock = scriptPresent
    ? [
        'Manuscript vs speech (C): A planned script excerpt is below. Compare it to the spoken transcript excerpt.',
        'Use the gap to coach delivery: how THIS persona would phrase, pace, signpost, or open/close that same beat — not to replace the whole argument or invent new facts.',
        'Planned script (excerpt):',
        planExcerpt,
      ].join('\n')
    : [
        'No uploaded manuscript (fallback): There is NO plan-vs-actual script pairing.',
        'phrase_rewrites and persona-aligned examples MUST quote only from the "Recent speech" transcript below.',
        'Do not invent lines the user "should have said from a script" they did not provide.',
        'Focus on HOW they spoke: wording, rhythm, pauses, clarity, signposting, tone — in the selected persona\'s voice. Do not reorganize deck narrative or add new claims.',
      ].join('\n');

  const userBlock = [
    coachMeta,
    '',
    topicMeta,
    `Duration: ${ctx.speech_coaching.total_duration_sec}s (~${durationMin} min)`,
    paceRange
      ? `Average speech rate: ${avgWpm} ${paceRange.unit === 'spm' ? 'syllables/min (Korean presentation pace)' : 'words/min'} (coach target ${paceRange.min}–${paceRange.max})`
      : `Average speech rate: ${avgWpm} words/min`,
    `Filler words: ${ctx.speech_coaching.filler_count}`,
    `Off-topic moments: ${ctx.speech_coaching.off_topic_log.length} (${offExcerpts || 'none'})`,
    `Logic/coherence breaks: ${ctx.speech_coaching.logic_break_log.length} (semantic windows: ${ctx.speech_coaching.semantic_check_count}, coherent: ${ctx.speech_coaching.coherence_pass_count})`,
    `Eye contact rate: ${Math.round(ctx.nonverbal_coaching.gaze_rate * 100)}%`,
    `Posture stability: ${scores.nonverbalScore}/100`,
    `Gesture count: excess=${ctx.nonverbal_coaching.gesture_log.filter(g => g.type === 'excess').length}, lack=${ctx.nonverbal_coaching.gesture_log.filter(g => g.type === 'lack').length}`,
    `Body dynamism: ${ctx.nonverbal_coaching.dynamism_log.length > 0 ? `natural=${Math.round(ctx.nonverbal_coaching.dynamism_log.filter(d => d.level === 'natural').length / ctx.nonverbal_coaching.dynamism_log.length * 100)}%, stiff=${Math.round(ctx.nonverbal_coaching.dynamism_log.filter(d => d.level === 'stiff').length / ctx.nonverbal_coaching.dynamism_log.length * 100)}%, restless=${Math.round(ctx.nonverbal_coaching.dynamism_log.filter(d => d.level === 'restless').length / ctx.nonverbal_coaching.dynamism_log.length * 100)}%` : 'no camera data'}`,
    ctx.qa_skipped
      ? scriptPresent
        ? 'Q&A: skipped — coach from speech, nonverbal, and manuscript vs transcript as below; no Q&A exchanges.'
        : 'Q&A: skipped — coach from speech, nonverbal, and materials/transcript only (no uploaded manuscript).'
      : `Q&A score: ${scores.qaScore}/100 (weakest: Q${ctx.qa.worst_answer_turn})`,
    ctx.qa_skipped
      ? `Composite: ${scores.compositeScore}/100 (speech ${scores.speechScore}, nonverbal ${scores.nonverbalScore}; Q&A not included)`
      : `Composite: ${scores.compositeScore}/100 (speech ${scores.speechScore}, nonverbal ${scores.nonverbalScore}, Q&A ${scores.qaScore})`,
    scriptCoverageBlock,
    scriptStyleBlock,
    '',
    manuscriptVsSpeechBlock,
    '',
    `Recent speech (excerpt, actual delivery — for phrase_rewrites, from_session MUST be a substring of this when no manuscript; with manuscript, prefer lines that clearly reflect spoken wording):`,
    speechExcerpt || '(no transcript captured)',
    '',
    contextBlock,
    timelineBlock,
  ].filter(Boolean).join('\n');

  const personaBlock = personaPrompt
    ? `\n[Coaching Persona]\n${personaPrompt}\nAdopt this persona's voice, priorities, and style when writing strengths and improvements. The tone of every sentence should reflect this persona.\n`
    : '';

  const personaStyleBlock = persona
    ? `
ALSO include top-level JSON field "persona_style_coaching" (required for this session):
{
  "style_alignment": "2-4 sentences: tie composite/speech/nonverbal numbers + timeline moments to THIS persona's benchmark (pace, pauses, rhetoric, body).",
  "delivery_practices": ["3-5 bullets","..."] — concrete rehearsal habits for the NEXT session; same persona priorities, second person, no fluff.",
  "phrase_rewrites": [
    {"from_session": "short spoken line (see rules)","persona_aligned_example": "same beat in THIS persona's delivery","why": "optional one short clause: e.g. clearer signpost / warmer pause / sharper opener"}
  ]
}
phrase_rewrites RULES (speaking manner / delivery only — NOT whole-structure rewrites):
- Rewrite HOW something is SAID (pace, diction, framing, rhetorical moves, openings/closers), not deck outline or new evidence.
- If a manuscript excerpt was provided above: you MAY contrast plan vs actual and show how this persona would deliver that beat; keep factual intent aligned unless the speaker clearly misspoke.
- If NO manuscript was provided: from_session MUST be copied verbatim (or contiguous substring) from the "Recent speech" excerpt only. Never fabricate a planned line.
- Include 2–5 phrase_rewrites when the Recent speech excerpt is substantial (roughly ≥120 characters); use fewer or [] if the transcript is too thin to quote fairly; never more than 5.
- Each "why" is optional but preferred when it names a concrete delivery habit (not generic praise).
`
    : '';

  const sys = `${aiOutputLanguageRule(locale)}

You are a world-class presentation coach trusted by Silicon Valley founders and executives.
Your job is to give ACTIONABLE coaching — not vague scores or abstract suggestions.

Analyze this session data and produce JSON output.
${personaBlock}

RULES:
- "strengths": 2-3 short sentences. Reference specific data AND timestamps${locale === 'ko' ? ' (예: "1분 20초에 \'API 통합\'을 말할 때 제스처가 잘 맞았어요").' : ' (e.g., "At 1m20s you used a gesture perfectly aligned with API integration").'}
- "improvements": Exactly 3 actionable coaching items. Each must follow this structure:
  - "label": Short title — ${locale === 'ko' ? '한국어로만 (예: "자세 안정", "말 빠르기")' : 'in clear English (e.g., "Posture Stability", "Speech Pace")'}
  - "situation": What the data shows — MUST reference specific timestamps like "At 2m30s..." or "Between 1m00s–3m15s...". Quote the timeline data provided. (e.g., "At 2m30s your posture became unstable right when you were explaining the revenue model. This lasted until around 3m15s.")
  - "stop_doing": One concrete habit to STOP, referencing the moment (e.g., "At 2m30s you started shifting weight — stop doing this when transitioning between data points.")
  - "start_doing": One concrete behavior to START (e.g., "Plant both feet shoulder-width apart. At moments like 2m30s, take a 1-second pause before the transition instead of shuffling.")
  - "expected_impact": Why this matters to the AUDIENCE or investor.
  - "time_markers": Array of 1-3 specific moments: [{"time": "2m30s", "event": "posture unstable during revenue explanation"}, ...]

CRITICAL: You have a full timestamped timeline below. USE IT. Every "situation" and "stop_doing" MUST reference at least one specific timestamp. Generic advice without timestamps is unacceptable.
AVOID: generic advice like "improve your posture" or "use more gestures."
ALWAYS: connect the expected impact to audience psychology — how it affects trust, credibility, engagement, or persuasion.

[Session Data]
${userBlock}

Response format:
{
  "strengths": ["...", "..."],
  "improvements": [
    {
      "label": "...",
      "situation": "...",
      "stop_doing": "...",
      "start_doing": "...",
      "expected_impact": "...",
      "time_markers": [{"time": "2m30s", "event": "short description"}]
    }
  ]${persona ? ',\n  "persona_style_coaching": { "style_alignment": "...", "delivery_practices": ["..."], "phrase_rewrites": [{"from_session":"...","persona_aligned_example":"...","why":"optional short delivery reason"}] }' : ''}
}
${personaStyleBlock}`;

  if (!hasOpenAI()) {
    return buildFallbackNarrative(ctx, scores, persona, locale);
  }

  let parsed = await chatJson<ReportNarrative>('gpt-4o', sys, 'The data is in the system message above.');
  if (!parsed?.strengths?.length || !parsed?.improvements?.length) {
    return buildFallbackNarrative(ctx, scores, persona, locale);
  }

  if (!deepLocaleOk({ strengths: parsed.strengths, improvements: parsed.improvements }, locale)) {
    const retryHint =
      locale === 'ko'
        ? '이전 응답이 영어로 작성됐어요. 모든 string 값을 한국어(존댓말)로 다시 작성해 주세요.'
        : 'Previous reply was in the wrong language. Rewrite every JSON string value in clear English.';
    try {
      const retry = await chatJson<ReportNarrative>('gpt-4o', sys, retryHint);
      if (retry?.strengths?.length && retry?.improvements?.length) parsed = retry;
    } catch (e) {
      console.warn('[report] locale retry failed', e);
    }
  }

  if (persona) {
    const coaching = normalizePersonaStyleCoaching(parsed.persona_style_coaching, persona, ctx, scores);
    const withRewrites = {
      ...parsed,
      persona_style_coaching: await enrichPhraseRewritesIfMissing(coaching, persona, ctx),
    };
    return sanitizeKoUserFacingDeep(withRewrites, locale);
  }

  return sanitizeKoUserFacingDeep(
    { strengths: parsed.strengths, improvements: parsed.improvements },
    locale,
  );
}

export function buildFallbackNarrative(
  ctx: SessionContext,
  scores: ReportScores & { contextAnalysis: ContextAnalysisResult },
  persona?: Persona | null,
  outputLocale?: AppLocale,
): ReportNarrative {
  const locale = outputLocale ?? resolveLocaleForCurrentApp();
  const ko = locale === 'ko';
  const sessionStart = new Date(ctx.started_at).getTime();
  const gazePercent = Math.round(ctx.nonverbal_coaching.gaze_rate * 100);
  const ca = scores.contextAnalysis;
  const durationMin = Math.round(ctx.speech_coaching.total_duration_sec / 60);

  const strengths: string[] = [];
  if (gazePercent >= 70) {
    strengths.push(
      ko
        ? `시선 맞춤이 ${gazePercent}%로 유지됐어요. 자신감이 느껴지고 청중의 주의를 붙잡기 좋아요.`
        : `Maintained ${gazePercent}% eye contact — this signals strong confidence and keeps your audience locked in.`,
    );
  }
  if (ca.keywordGestureHits > 0) {
    const hitInsight = ca.insights.find((i) => i.type === 'keyword_gesture');
    const timeRef =
      hitInsight && hitInsight.timestamp > 0
        ? ko
          ? ` (${tsToLabel(hitInsight.timestamp, sessionStart)} 등)`
          : ` (e.g., at ${tsToLabel(hitInsight.timestamp, sessionStart)})`
        : '';
    strengths.push(
      ko
        ? `핵심 포인트에 제스처를 ${ca.keywordGestureHits}번 맞췄어요${timeRef} — 청중이 중요한 정보를 더 잘 기억해요.`
        : `Used gestures to emphasize key points ${ca.keywordGestureHits} time(s)${timeRef} — this helps your audience retain critical information.`,
    );
  }
  if (ctx.speech_coaching.filler_count === 0) {
    strengths.push(
      ko
        ? '필러가 거의 없었어요 — 말이 다듬어져 들려 신뢰감이 올라갑니다.'
        : 'Zero filler words detected — your delivery sounds polished and rehearsed, which builds credibility.',
    );
  }
  if (strengths.length === 0) {
    strengths.push(
      ko
        ? `약 ${durationMin}분 발표를 마쳤고 종합 점수는 ${scores.compositeScore}/100이에요.`
        : `Completed a ${durationMin}-minute presentation with a ${scores.compositeScore}/100 composite score.`,
    );
  }

  const improvements: ActionableFeedback[] = [];

  if (scores.nonverbalScore < 80) {
    const postureIssue = ctx.nonverbal_coaching.posture_log.find((p) => !p.is_ok);
    const pTime = postureIssue ? tsToLabel(postureIssue.timestamp, sessionStart) : undefined;
    improvements.push({
      label: ko ? '자세 안정' : 'Posture Stability',
      situation: ko
        ? `자세 점수는 ${scores.nonverbalScore}/100이에요.${pTime ? ` ${pTime}쯤 불안정이 처음 보였어요.` : ' 세션 중 불안정 구간이 감지됐어요.'}`
        : `Your posture score was ${scores.nonverbalScore}/100.${pTime ? ` Instability was first detected at ${pTime}.` : ' The system detected instability during your session.'}`,
      stop_doing: ko
        ? `말할 때 체중을 좌우로 옮기거나 흔들지 마세요${pTime ? ` — 특히 ${pTime} 전후에 두드러졌어요` : ''}.`
        : `Stop swaying or shifting weight between feet while speaking${pTime ? ` — this was especially visible around ${pTime}` : ''}.`,
      start_doing: ko
        ? '발을 어깨 너비로 고정하고, 핵심 포인트마다 1초 멈춤으로 자세를 잡아 보세요.'
        : 'Plant both feet shoulder-width apart. Before each key point, take a 1-second pause with a stable stance.',
      expected_impact: ko
        ? '안정된 자세는 권위와 확신으로 읽혀요. 청중·투자자는 몸의 안정을 메시지 신뢰로 받아들입니다.'
        : 'A grounded posture projects authority. Investors read physical stability as conviction in your message.',
      time_markers: pTime
        ? [{ time: pTime, event: ko ? '자세 불안정 감지' : 'posture instability detected' }]
        : [],
    });
  }

  if (ca.keywordGestureMisses > 0) {
    const missInsight = ca.insights.find((i) => i.type === 'keyword_still');
    const mTime = missInsight && missInsight.timestamp > 0 ? tsToLabel(missInsight.timestamp, sessionStart) : undefined;
    improvements.push({
      label: ko ? '제스처·말 맞춤' : 'Gesture-Speech Alignment',
      situation: ko
        ? `핵심 개념을 ${ca.keywordGestureMisses}번 말했는데 제스처가 따라오지 않았어요.${mTime ? ` 예: ${mTime} — ${missInsight!.description}` : ''}`
        : `You mentioned key concepts ${ca.keywordGestureMisses} time(s) without any accompanying gesture.${mTime ? ` For example, at ${mTime}: ${missInsight!.description}.` : ''}`,
      stop_doing: ko
        ? `중요한 말할 때 손을 옆에 두거나 모으지 마세요${mTime ? ` — ${mTime}에 특히 그랬어요` : ''}.`
        : `Stop keeping your hands at your sides or clasped when delivering important points${mTime ? ` — at ${mTime} this was clearly visible` : ''}.`,
      start_doing: ko
        ? '키워드마다 손바닥을 펴거나 손가락으로 짚어 시각적 무게를 주세요.'
        : 'When you say a keyword, use an open-palm gesture or count on fingers to give it visual weight.',
      expected_impact: ko
        ? '말과 몸이 맞을 때 기억률이 올라가요 — 상위 발표자들이 쓰는 방식이에요.'
        : 'Audiences remember 30% more when verbal and visual cues align — this is how top speakers make ideas stick.',
      time_markers: mTime ? [{ time: mTime, event: missInsight!.description }] : [],
    });
  }

  if (ca.rhythmScore < 60) {
    const freezeInsight = ca.insights.find((i) => i.type === 'long_freeze');
    const fTime = freezeInsight && freezeInsight.timestamp > 0 ? tsToLabel(freezeInsight.timestamp, sessionStart) : undefined;
    improvements.push({
      label: ko ? '움직임 리듬' : 'Movement Rhythm',
      situation: ko
        ? `제스처 리듬 점수는 ${ca.rhythmScore}/100 — 움직임이 고르지 않았어요.${fTime ? ` ${fTime}부터 긴 정지가 보였어요.` : ''}`
        : `Your gesture rhythm score is ${ca.rhythmScore}/100 — gestures were clustered unevenly.${fTime ? ` A long freeze was detected starting at ${fTime}.` : ''}`,
      stop_doing: ko
        ? `오래 멈춘 뒤 갑자기 빠르게 손을 쓰지 마세요${fTime ? ` — ${fTime} 정지가 30초 넘었어요` : ''}.`
        : `Don't freeze for long stretches then suddenly gesture rapidly${fTime ? ` — the freeze at ${fTime} lasted over 30 seconds` : ''}.`,
      start_doing: ko
        ? '문장마다 의도적인 제스처 하나씩, 고르게 배치해 연습해 보세요.'
        : 'Practice "punctuation gestures" — one deliberate hand movement per key sentence, evenly spaced.',
      expected_impact: ko
        ? '리듬 있는 몸짓은 침착함과 통제감을 줘요 — 숙련 발표자의 특징입니다.'
        : 'Rhythmic body language creates a sense of composed control — the hallmark of a seasoned presenter.',
      time_markers: fTime ? [{ time: fTime, event: freezeInsight!.description }] : [],
    });
  }

  if (improvements.length === 0) {
    if (ctx.qa_skipped) {
      improvements.push({
        label: ko ? 'Q&A 연습' : 'Audience Q&A rehearsal',
        situation: ko
          ? '이번엔 라이브 Q&A를 건너뛰어서 리포트는 말하기·무대 존재감만 반영돼요.'
          : 'You skipped the live Q&A drill this time — the report reflects speech and presence only.',
        stop_doing: ko
          ? '대본만 완벽한 연습에만 의존하지 마세요.'
          : 'Stop relying only on scripted delivery without pressure-testing hard questions.',
        start_doing: ko
          ? '다음 세션엔 발표 후 Q&A(3~5문항)를 돌려 날카로운 질문에도 답해 보세요.'
          : 'Next session, run the post-talk Q&A (3–5 questions) so we can score how you handle objections and off-script probes.',
        expected_impact: ko
          ? '투자·청중은 Q&A에서 결정하는 경우가 많아요 — 슬라이드와 실전 신뢰의 간극을 줄입니다.'
          : 'Investors often decide in Q&A; rehearsing there closes the gap between polished slides and trusted expertise.',
        time_markers: [],
      });
    } else {
      improvements.push({
        label: ko ? 'Q&A 깊이' : 'Q&A Depth',
        situation: ko
          ? `Q&A 점수는 ${scores.qaScore}/100이에요. 가장 약한 답은 ${ctx.qa.worst_answer_turn}번 질문이었어요.`
          : `Your Q&A score was ${scores.qaScore}/100. Weakest answer was on question ${ctx.qa.worst_answer_turn}.`,
        stop_doing: ko
          ? '짧고 표면적인 답만 하지 마세요.'
          : 'Stop giving short, surface-level answers that lack supporting evidence.',
        start_doing: ko
          ? '답마다 상황·과제·행동·결과(STAR) 구조로 말해 보세요.'
          : 'Use the STAR method (Situation, Task, Action, Result) for each Q&A answer to add structure.',
        expected_impact: ko
          ? '구조화된 답은 깊은 이해를 보여줘요 — 즉흥 질문에도 당당함이 필요합니다.'
          : 'Structured answers signal deep domain knowledge — investors want to see you can think on your feet.',
        time_markers: [],
      });
    }
  }

  const persona_style_coaching = persona ? fallbackPersonaStyleCoaching(persona, ctx, scores) : undefined;
  return sanitizeKoUserFacingDeep({ strengths, improvements, persona_style_coaching }, locale);
}
