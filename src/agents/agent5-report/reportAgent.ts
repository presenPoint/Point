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

function calcGazeScore(gazeRate: number): number {
  if (gazeRate >= 0.6 && gazeRate <= 0.85) return 100;
  if (gazeRate > 0.85) return Math.round(100 - (gazeRate - 0.85) * 200);
  return Math.round(gazeRate * 150);
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

  const gazeScore = calcGazeScore(ctx.nonverbal_coaching.gaze_rate);
  const postureScore = calcPostureScore(ctx.nonverbal_coaching.posture_log, ctx.nonverbal_coaching.dynamism_log);
  const gestureScore = calcGestureScore(
    ctx.nonverbal_coaching.gesture_log,
    ctx.speech_coaching.total_duration_sec,
    contextAnalysis.rhythmScore,
  );

  const nonverbalBase = Math.round(gazeScore * 0.35 + postureScore * 0.25 + gestureScore * 0.2 + contextAnalysis.contextScore * 0.2);
  const nonverbalScore = Math.max(0, Math.min(100, nonverbalBase));

  const qaScore = ctx.qa.final_score || 0;

  const compositeScore = Math.round(speechScore * 0.4 + nonverbalScore * 0.3 + qaScore * 0.3);

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
          (r): r is { from_session: string; persona_aligned_example: string } =>
            r &&
            typeof r.from_session === 'string' &&
            typeof r.persona_aligned_example === 'string' &&
            r.from_session.trim().length > 0 &&
            r.persona_aligned_example.trim().length > 0,
        )
        .slice(0, 2)
        .map((r) => ({
          from_session: r.from_session.trim().slice(0, 220),
          persona_aligned_example: r.persona_aligned_example.trim().slice(0, 280),
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

  // Script coverage (passed in from sessionStore after calcScriptCoverage)
  const scriptCoverageBlock = scriptCoverage != null
    ? `Script coverage: ${Math.round(scriptCoverage * 100)}% of planned script sections delivered`
    : '';

  // Script style summary
  const scriptStyleBlock = ctx.material.script_style
    ? `Script style: ${ctx.material.script_style.tone} tone, ${ctx.material.script_style.complexity} complexity, ~${ctx.material.script_style.estimatedMinutes} min planned`
    : '';

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
    `Q&A score: ${scores.qaScore}/100 (weakest: Q${ctx.qa.worst_answer_turn})`,
    `Composite: ${scores.compositeScore}/100 (speech ${scores.speechScore}, nonverbal ${scores.nonverbalScore}, Q&A ${scores.qaScore})`,
    scriptCoverageBlock,
    scriptStyleBlock,
    '',
    `Recent speech (excerpt, partial transcript — quote only what appears here for phrase_rewrites):`,
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
    {"from_session": "short line grounded in Recent speech excerpt","persona_aligned_example": "clearer / more on-brand line in this persona's voice"}
  ]
}
Use 0-2 phrase_rewrites only; use [] if the excerpt is too thin to quote fairly. Never invent from_session text that is not clearly supported by the excerpt.
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
  ]${persona ? ',\n  "persona_style_coaching": { "style_alignment": "...", "delivery_practices": ["..."], "phrase_rewrites": [] }' : ''}
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
    improvements.push({
      label: 'Q&A Depth',
      situation: `Your Q&A score was ${scores.qaScore}/100. Weakest answer was on question ${ctx.qa.worst_answer_turn}.`,
      stop_doing: 'Stop giving short, surface-level answers that lack supporting evidence.',
      start_doing: 'Use the STAR method (Situation, Task, Action, Result) for each Q&A answer to add structure.',
      expected_impact: 'Structured answers signal deep domain knowledge — investors want to see you can think on your feet.',
    });
  }

  const persona_style_coaching = persona ? fallbackPersonaStyleCoaching(persona, ctx, scores) : undefined;
  return { strengths, improvements, persona_style_coaching };
}
