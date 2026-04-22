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

function tsToLabel(ts: number, sessionStart: number): string {
  const elapsed = Math.max(0, Math.round((ts - sessionStart) / 1000));
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return `${m}m${String(s).padStart(2, '0')}s`;
}

function calcWpmScore(wpmLog: { wpm: number }[], wpmRange?: [number, number]): number {
  if (wpmLog.length === 0) return 70;
  const [min, max] = wpmRange ?? [250, 350];
  const inRange = wpmLog.filter((e) => e.wpm >= min && e.wpm <= max).length;
  return Math.round((inRange / wpmLog.length) * 100);
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
  if (gazeRate >= 0.60 && gazeRate <= 0.80) {
    rateScore = 60;
  } else if (gazeRate > 0.80 && gazeRate <= 0.92) {
    rateScore = 60 - (gazeRate - 0.80) * 167; // 60→40
  } else if (gazeRate > 0.92) {
    rateScore = Math.max(20, 40 - (gazeRate - 0.92) * 250); // 로봇처럼 응시
  } else if (gazeRate >= 0.40) {
    rateScore = 20 + (gazeRate - 0.40) * 200; // 20→60
  } else {
    rateScore = gazeRate * 50; // 40% 미만: 비례 감점
  }

  // ── Component 2: 이탈 패턴 (0–20 pts) ────────────────────────────────────
  // 짧고 자연스러운 이탈(1-3s)은 허용, 긴 이탈(>5s)과 잦은 이탈은 감점.
  const breaks = analyzeGazeBreaks(gazeLog);
  const longBreaks = breaks.filter((b) => b.durationMs > 5000);
  const veryLongBreaks = breaks.filter((b) => b.durationMs > 10000);
  const excessBreaks = Math.max(0, breaks.length - 12); // 12회 초과 이탈

  const breakPenalty = Math.min(20,
    longBreaks.length * 4 +
    veryLongBreaks.length * 4 +
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
    dirScore = 0; // 한쪽만 바라봄
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
  const stiffPenalty = Math.round(stiffRate * 30);
  const restlessPenalty = Math.round(restlessRate * 20);

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

  const excessPenalty = Math.min(40, excess * 8);
  const freezePenalty = durationSec > 60 && gestureLog.length === 0 ? 30 : 0;

  const base = Math.max(0, 100 - excessPenalty - freezePenalty);
  return Math.round(base * 0.6 + rhythmScore * 0.4);
}

export function calcCompositeScore(ctx: SessionContext, wpmRange?: [number, number]): ReportScores & { contextAnalysis: ContextAnalysisResult } {
  const contextAnalysis = analyzeContext(ctx);

  const wpmScore = calcWpmScore(ctx.speech_coaching.wpm_log, wpmRange);
  const fillerScore = Math.max(0, 100 - ctx.speech_coaching.filler_count * 5);
  const offTopicScore = Math.max(0, 100 - ctx.speech_coaching.off_topic_log.length * 15);
  const ambiguousScore = Math.max(0, 100 - ctx.speech_coaching.ambiguous_count * 3);

  const speechScore = Math.round(
    wpmScore * 0.3 + fillerScore * 0.3 + offTopicScore * 0.25 + ambiguousScore * 0.15
  );

  const gazeScore = calcGazeScore(ctx.nonverbal_coaching.gaze_log);
  const postureScore = calcPostureScore(ctx.nonverbal_coaching.posture_log, ctx.nonverbal_coaching.dynamism_log);
  const gestureScore = calcGestureScore(
    ctx.nonverbal_coaching.gesture_log,
    ctx.speech_coaching.total_duration_sec,
    contextAnalysis.rhythmScore,
  );

  const nonverbalBase = Math.round(gazeScore * 0.35 + postureScore * 0.25 + gestureScore * 0.2 + contextAnalysis.contextScore * 0.2);
  const nonverbalScore = Math.max(0, Math.min(100, nonverbalBase));

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
  const parts = ctx.speech_coaching.transcript_log.slice(-24).map((e) => e.text.trim()).filter(Boolean);
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
  const [wMin, wMax] = persona.config.wpmRange;
  const paceNote =
    avgWpm === 0
      ? 'Pace data was thin this run—next time aim for the coach’s WPM band in calmer segments.'
      : avgWpm >= wMin && avgWpm <= wMax
        ? `Average pace (~${avgWpm} WPM) sat inside this coach’s ${wMin}–${wMax} WPM band—good alignment for this style.`
        : `Average pace (~${avgWpm} WPM) drifted outside this coach’s ${wMin}–${wMax} WPM band—rehearse opening and transitions in that window.`;

  return {
    style_alignment: `${persona.name} (${persona.presentationInfo.archetype}) — ${paceNote} Composite score ${scores.compositeScore}/100.`,
    delivery_practices: persona.presentationInfo.principles.slice(0, 5),
    phrase_rewrites: [],
  };
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

function buildTimeline(ctx: SessionContext, sessionStart: number): string {
  const events: { ts: number; desc: string }[] = [];

  for (const entry of ctx.speech_coaching.wpm_log) {
    if (entry.wpm > 350 || entry.wpm < 100 && entry.wpm > 0) {
      events.push({ ts: entry.timestamp, desc: `Speech pace: ${entry.wpm} WPM (${entry.wpm > 350 ? 'too fast' : 'too slow'})` });
    }
  }

  for (const entry of ctx.speech_coaching.off_topic_log) {
    events.push({ ts: entry.timestamp, desc: `Off-topic: "${entry.excerpt.slice(0, 60)}" — ${entry.reason}` });
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
  const offExcerpts = ctx.speech_coaching.off_topic_log.map((e) => `[${tsToLabel(e.timestamp, sessionStart)}] "${e.excerpt}"`).join(' / ');
  const contextBlock = formatInsightsForGPT(scores.contextAnalysis, sessionStart);
  const timelineBlock = buildTimeline(ctx, sessionStart);
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
    `Average speech rate: ${avgWpm} words/min`,
    `Filler words: ${ctx.speech_coaching.filler_count}`,
    `Off-topic moments: ${ctx.speech_coaching.off_topic_log.length} (${offExcerpts || 'none'})`,
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

  const sys = `You are a world-class presentation coach trusted by Silicon Valley founders and executives.
Your job is to give ACTIONABLE coaching — not vague scores or abstract suggestions.

Analyze this session data and produce JSON output.
${personaBlock}
RULES:
- "strengths": 2-3 short sentences. Reference specific data AND timestamps (e.g., "At 1m20s you used a gesture perfectly aligned with 'API integration'").
- "improvements": Exactly 3 actionable coaching items. Each must follow this structure:
  - "label": Short title (e.g., "Posture Stability")
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
    return buildFallbackNarrative(ctx, scores, persona);
  }

  const parsed = await chatJson<ReportNarrative>('gpt-4o', sys, 'The data is in the system message above.');
  if (!parsed?.strengths?.length || !parsed?.improvements?.length) {
    return buildFallbackNarrative(ctx, scores, persona);
  }

  if (persona) {
    return {
      ...parsed,
      persona_style_coaching: normalizePersonaStyleCoaching(parsed.persona_style_coaching, persona, ctx, scores),
    };
  }

  return { strengths: parsed.strengths, improvements: parsed.improvements };
}

function buildFallbackNarrative(
  ctx: SessionContext,
  scores: ReportScores & { contextAnalysis: ContextAnalysisResult },
  persona?: Persona | null,
): ReportNarrative {
  const sessionStart = new Date(ctx.started_at).getTime();
  const gazePercent = Math.round(ctx.nonverbal_coaching.gaze_rate * 100);
  const ca = scores.contextAnalysis;

  const strengths: string[] = [];
  if (gazePercent >= 70)
    strengths.push(`Maintained ${gazePercent}% eye contact — this signals strong confidence and keeps your audience locked in.`);
  if (ca.keywordGestureHits > 0) {
    const hitInsight = ca.insights.find(i => i.type === 'keyword_gesture');
    const timeRef = hitInsight && hitInsight.timestamp > 0 ? ` (e.g., at ${tsToLabel(hitInsight.timestamp, sessionStart)})` : '';
    strengths.push(`Used gestures to emphasize key points ${ca.keywordGestureHits} time(s)${timeRef} — this helps your audience retain critical information.`);
  }
  if (ctx.speech_coaching.filler_count === 0)
    strengths.push('Zero filler words detected — your delivery sounds polished and rehearsed, which builds credibility.');
  if (strengths.length === 0)
    strengths.push(`Completed a ${Math.round(ctx.speech_coaching.total_duration_sec / 60)}-minute presentation with a ${scores.compositeScore}/100 composite score.`);

  const improvements: ActionableFeedback[] = [];

  if (scores.nonverbalScore < 80) {
    const postureIssue = ctx.nonverbal_coaching.posture_log.find(p => !p.is_ok);
    const pTime = postureIssue ? tsToLabel(postureIssue.timestamp, sessionStart) : undefined;
    improvements.push({
      label: 'Posture Stability',
      situation: `Your posture score was ${scores.nonverbalScore}/100.${pTime ? ` Instability was first detected at ${pTime}.` : ' The system detected instability during your session.'}`,
      stop_doing: `Stop swaying or shifting weight between feet while speaking${pTime ? ` — this was especially visible around ${pTime}` : ''}.`,
      start_doing: 'Plant both feet shoulder-width apart. Before each key point, take a 1-second pause with a stable stance.',
      expected_impact: 'A grounded posture projects authority. Investors read physical stability as conviction in your message.',
      time_markers: pTime ? [{ time: pTime, event: 'posture instability detected' }] : [],
    });
  }

  if (ca.keywordGestureMisses > 0) {
    const missInsight = ca.insights.find(i => i.type === 'keyword_still');
    const mTime = missInsight && missInsight.timestamp > 0 ? tsToLabel(missInsight.timestamp, sessionStart) : undefined;
    improvements.push({
      label: 'Gesture-Speech Alignment',
      situation: `You mentioned key concepts ${ca.keywordGestureMisses} time(s) without any accompanying gesture.${mTime ? ` For example, at ${mTime}: ${missInsight!.description}.` : ''}`,
      stop_doing: `Stop keeping your hands at your sides or clasped when delivering important points${mTime ? ` — at ${mTime} this was clearly visible` : ''}.`,
      start_doing: 'When you say a keyword, use an open-palm gesture or count on fingers to give it visual weight.',
      expected_impact: 'Audiences remember 30% more when verbal and visual cues align — this is how top speakers make ideas stick.',
      time_markers: mTime ? [{ time: mTime, event: missInsight!.description }] : [],
    });
  }

  if (ca.rhythmScore < 60) {
    const freezeInsight = ca.insights.find(i => i.type === 'long_freeze');
    const fTime = freezeInsight && freezeInsight.timestamp > 0 ? tsToLabel(freezeInsight.timestamp, sessionStart) : undefined;
    improvements.push({
      label: 'Movement Rhythm',
      situation: `Your gesture rhythm score is ${ca.rhythmScore}/100 — gestures were clustered unevenly.${fTime ? ` A long freeze was detected starting at ${fTime}.` : ''}`,
      stop_doing: `Don't freeze for long stretches then suddenly gesture rapidly${fTime ? ` — the freeze at ${fTime} lasted over 30 seconds` : ''}.`,
      start_doing: 'Practice "punctuation gestures" — one deliberate hand movement per key sentence, evenly spaced.',
      expected_impact: 'Rhythmic body language creates a sense of composed control — the hallmark of a seasoned presenter.',
      time_markers: fTime ? [{ time: fTime, event: freezeInsight!.description }] : [],
    });
  }

  if (improvements.length === 0) {
    if (ctx.qa_skipped) {
      improvements.push({
        label: 'Audience Q&A rehearsal',
        situation:
          'You skipped the live Q&A drill this time — the report reflects speech and presence only.',
        stop_doing: 'Stop relying only on scripted delivery without pressure-testing hard questions.',
        start_doing:
          'Next session, run the post-talk Q&A (3–5 questions) so we can score how you handle objections and off-script probes.',
        expected_impact: 'Investors often decide in Q&A; rehearsing there closes the gap between polished slides and trusted expertise.',
        time_markers: [],
      });
    } else {
      improvements.push({
        label: 'Q&A Depth',
        situation: `Your Q&A score was ${scores.qaScore}/100. Weakest answer was on question ${ctx.qa.worst_answer_turn}.`,
        stop_doing: 'Stop giving short, surface-level answers that lack supporting evidence.',
        start_doing: 'Use the STAR method (Situation, Task, Action, Result) for each Q&A answer to add structure.',
        expected_impact: 'Structured answers signal deep domain knowledge — investors want to see you can think on your feet.',
      });
    }
  }

  const persona_style_coaching = persona ? fallbackPersonaStyleCoaching(persona, ctx, scores) : undefined;
  return { strengths, improvements, persona_style_coaching };
}
