/**
 * Agent 5 — Report & Analytics. Spec: ./AGENT.md
 */
import { chatJson, hasOpenAI } from '../../lib/openai';
import type { ActionableFeedback, ReportScores, SessionContext } from '../../types/session';
import { analyzeContext, type ContextAnalysisResult } from './contextAnalysis';

function calcWpmScore(wpmLog: { wpm: number }[]): number {
  if (wpmLog.length === 0) return 70;
  const inRange = wpmLog.filter((e) => e.wpm >= 250 && e.wpm <= 350).length;
  return Math.round((inRange / wpmLog.length) * 100);
}

function calcGazeScore(gazeRate: number): number {
  if (gazeRate >= 0.6 && gazeRate <= 0.85) return 100;
  if (gazeRate > 0.85) return Math.round(100 - (gazeRate - 0.85) * 200);
  return Math.round(gazeRate * 150);
}

function calcPostureScore(postureLog: { is_ok: boolean }[]): number {
  if (postureLog.length === 0) return 75;
  const okRate = postureLog.filter((e) => e.is_ok).length / postureLog.length;
  return Math.round(okRate * 100);
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

export function calcCompositeScore(ctx: SessionContext): ReportScores & { contextAnalysis: ContextAnalysisResult } {
  const contextAnalysis = analyzeContext(ctx);

  const wpmScore = calcWpmScore(ctx.speech_coaching.wpm_log);
  const fillerScore = Math.max(0, 100 - ctx.speech_coaching.filler_count * 5);
  const offTopicScore = Math.max(0, 100 - ctx.speech_coaching.off_topic_log.length * 15);
  const ambiguousScore = Math.max(0, 100 - ctx.speech_coaching.ambiguous_count * 3);

  const speechScore = Math.round(
    wpmScore * 0.3 + fillerScore * 0.3 + offTopicScore * 0.25 + ambiguousScore * 0.15
  );

  const gazeScore = calcGazeScore(ctx.nonverbal_coaching.gaze_rate);
  const postureScore = calcPostureScore(ctx.nonverbal_coaching.posture_log);
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
};

function formatInsightsForGPT(analysis: ContextAnalysisResult): string {
  const lines: string[] = [];

  lines.push(`[Cross-context Analysis]`);
  lines.push(`Gestures accompanying keyword speech: ${analysis.keywordGestureHits} / missed: ${analysis.keywordGestureMisses}`);
  lines.push(`Nervous fidgeting during filler words: ${analysis.fillerFidgetCount}`);
  lines.push(`Long freeze (30s+ no movement): ${analysis.freezeCount}`);
  lines.push(`Gesture rhythm score: ${analysis.rhythmScore}/100`);
  lines.push(`Context alignment score: ${analysis.contextScore}/100`);

  if (analysis.insights.length > 0) {
    lines.push('');
    lines.push('[Segment Observations]');
    for (const insight of analysis.insights.slice(0, 10)) {
      lines.push(`- ${insight.description}`);
    }
  }

  return lines.join('\n');
}

export async function generateReportNarrative(
  ctx: SessionContext,
  scores: ReportScores & { contextAnalysis: ContextAnalysisResult }
): Promise<ReportNarrative> {
  const avgWpm =
    ctx.speech_coaching.wpm_log.length === 0
      ? 0
      : Math.round(
          ctx.speech_coaching.wpm_log.reduce((a, b) => a + b.wpm, 0) /
            ctx.speech_coaching.wpm_log.length
        );

  const offExcerpts = ctx.speech_coaching.off_topic_log.map((e) => e.excerpt).join(' / ');
  const contextBlock = formatInsightsForGPT(scores.contextAnalysis);
  const durationMin = Math.round(ctx.speech_coaching.total_duration_sec / 60);

  const userBlock = [
    `Duration: ${ctx.speech_coaching.total_duration_sec}s (~${durationMin} min)`,
    `Average speech rate: ${avgWpm} words/min`,
    `Filler words: ${ctx.speech_coaching.filler_count}`,
    `Off-topic moments: ${ctx.speech_coaching.off_topic_log.length} (${offExcerpts || 'none'})`,
    `Eye contact rate: ${Math.round(ctx.nonverbal_coaching.gaze_rate * 100)}%`,
    `Posture stability: ${scores.nonverbalScore}/100`,
    `Gesture count: excess=${ctx.nonverbal_coaching.gesture_log.filter(g => g.type === 'excess').length}, lack=${ctx.nonverbal_coaching.gesture_log.filter(g => g.type === 'lack').length}`,
    `Q&A score: ${scores.qaScore}/100 (weakest: Q${ctx.qa.worst_answer_turn})`,
    `Composite: ${scores.compositeScore}/100 (speech ${scores.speechScore}, nonverbal ${scores.nonverbalScore}, Q&A ${scores.qaScore})`,
    '',
    contextBlock,
  ].join('\n');

  const sys = `You are a world-class presentation coach trusted by Silicon Valley founders and executives.
Your job is to give ACTIONABLE coaching — not vague scores or abstract suggestions.

Analyze this session data and produce JSON output.

RULES:
- "strengths": 2-3 short sentences. Reference specific data (e.g., "100% eye contact", "gestures used during keyword 'API integration'").
- "improvements": Exactly 3 actionable coaching items. Each must follow this structure:
  - "label": Short title (e.g., "Posture Stability")
  - "situation": What the data shows — reference specific moments/numbers (e.g., "Your posture score was 66/100. The system detected instability particularly during the middle portion of your talk.")
  - "stop_doing": One concrete habit to STOP (e.g., "Stop shifting your weight from foot to foot while explaining complex concepts.")
  - "start_doing": One concrete behavior to START (e.g., "Plant both feet shoulder-width apart. Use deliberate 2-second pauses when transitioning between slides.")
  - "expected_impact": Why this matters to the AUDIENCE or investor (e.g., "A stable stance signals confidence and authority — VCs associate physical stillness with conviction in your message.")

AVOID: generic advice like "improve your posture" or "use more gestures." Every piece of advice must be tied to THIS session's data.
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
      "expected_impact": "..."
    }
  ]
}`;

  if (!hasOpenAI()) {
    return buildFallbackNarrative(ctx, scores);
  }

  const parsed = await chatJson<ReportNarrative>('gpt-4o', sys, 'The data is in the system message above.');
  if (!parsed?.strengths?.length || !parsed?.improvements?.length) {
    return buildFallbackNarrative(ctx, scores);
  }
  return parsed;
}

function buildFallbackNarrative(
  ctx: SessionContext,
  scores: ReportScores & { contextAnalysis: ContextAnalysisResult }
): ReportNarrative {
  const gazePercent = Math.round(ctx.nonverbal_coaching.gaze_rate * 100);
  const ca = scores.contextAnalysis;

  const strengths: string[] = [];
  if (gazePercent >= 70)
    strengths.push(`Maintained ${gazePercent}% eye contact — this signals strong confidence and keeps your audience locked in.`);
  if (ca.keywordGestureHits > 0)
    strengths.push(`Used gestures to emphasize key points ${ca.keywordGestureHits} time(s) — this helps your audience retain critical information.`);
  if (ctx.speech_coaching.filler_count === 0)
    strengths.push('Zero filler words detected — your delivery sounds polished and rehearsed, which builds credibility.');
  if (strengths.length === 0)
    strengths.push(`Completed a ${Math.round(ctx.speech_coaching.total_duration_sec / 60)}-minute presentation with a ${scores.compositeScore}/100 composite score.`);

  const improvements: ActionableFeedback[] = [];

  if (scores.nonverbalScore < 80) {
    improvements.push({
      label: 'Posture Stability',
      situation: `Your posture score was ${scores.nonverbalScore}/100. The system detected instability during your session.`,
      stop_doing: 'Stop swaying or shifting weight between feet while speaking — it signals nervousness to the audience.',
      start_doing: 'Plant both feet shoulder-width apart. Before each key point, take a 1-second pause with a stable stance.',
      expected_impact: 'A grounded posture projects authority. Investors read physical stability as conviction in your message.',
    });
  }

  if (ca.keywordGestureMisses > 0) {
    improvements.push({
      label: 'Gesture-Speech Alignment',
      situation: `You mentioned key concepts ${ca.keywordGestureMisses} time(s) without any accompanying gesture.`,
      stop_doing: 'Stop keeping your hands at your sides or clasped when delivering important points.',
      start_doing: 'When you say a keyword, use an open-palm gesture or count on fingers to give it visual weight.',
      expected_impact: 'Audiences remember 30% more when verbal and visual cues align — this is how top speakers make ideas stick.',
    });
  }

  if (ca.rhythmScore < 60) {
    improvements.push({
      label: 'Movement Rhythm',
      situation: `Your gesture rhythm score is ${ca.rhythmScore}/100 — gestures were clustered unevenly.`,
      stop_doing: 'Don\'t freeze for long stretches then suddenly gesture rapidly — it feels erratic to viewers.',
      start_doing: 'Practice "punctuation gestures" — one deliberate hand movement per key sentence, evenly spaced.',
      expected_impact: 'Rhythmic body language creates a sense of composed control — the hallmark of a seasoned presenter.',
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

  return { strengths, improvements };
}
