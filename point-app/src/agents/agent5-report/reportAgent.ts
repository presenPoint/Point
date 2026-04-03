/**
 * Agent 5 — Report & Analytics. Spec: ./AGENT.md
 */
import { chatJson, hasOpenAI } from '../../lib/openai';
import type { ReportScores, SessionContext } from '../../types/session';
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

type ReportNarrative = { strengths: string[]; improvements: string[] };

function formatInsightsForGPT(analysis: ContextAnalysisResult): string {
  const lines: string[] = [];

  lines.push(`[Cross-context Analysis]`);
  lines.push(`Gestures accompanying keyword speech: ${analysis.keywordGestureHits} times / Not accompanying: ${analysis.keywordGestureMisses} times`);
  lines.push(`Nervous movement during filler words: ${analysis.fillerFidgetCount} times`);
  lines.push(`Long freeze (30s+): ${analysis.freezeCount} times`);
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

  const userBlock = [
    `Total presentation time: ${ctx.speech_coaching.total_duration_sec} seconds`,
    `Average WPM: ${avgWpm}`,
    `Filler word count: ${ctx.speech_coaching.filler_count} times`,
    `Off-topic count: ${ctx.speech_coaching.off_topic_log.length} times / ${offExcerpts}`,
    `Gaze rate: ${Math.round(ctx.nonverbal_coaching.gaze_rate * 100)}%`,
    `Posture stability score: ${scores.nonverbalScore} points`,
    `Q&A score: ${scores.qaScore} points / Weakest turn: ${ctx.qa.worst_answer_turn}`,
    '',
    contextBlock,
  ].join('\n');

  const sys = `You are a presentation coach. Analyze the session data below and respond with JSON only.
Make active use of the [Cross-context Analysis] data to specifically mention the connection between verbal content and nonverbal behavior.
Write concrete feedback such as "used appropriate gestures when explaining keywords" or "nervous movement was detected during filler word segments."
Avoid abstract expressions — be specific based on actual data.

[Session Data]
${userBlock}

Response format:
{
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "improvements": ["improvement 1", "improvement 2", "improvement 3"]
}`;

  if (!hasOpenAI()) {
    return {
      strengths: [
        `Presented for ${ctx.speech_coaching.total_duration_sec} seconds.`,
        scores.contextAnalysis.keywordGestureHits > 0
          ? `Used appropriate gestures ${scores.contextAnalysis.keywordGestureHits} time(s) when explaining key keywords.`
          : `Q&A score is ${scores.qaScore} points.`,
        scores.contextAnalysis.rhythmScore >= 70
          ? 'Showed even gesture distribution throughout the presentation.'
          : 'Material comprehension was verified through the pre-quiz.',
      ],
      improvements: [
        'Try to keep your WPM in the 250–350 syllables/min range.',
        scores.contextAnalysis.fillerFidgetCount > 0
          ? `Nervous movement detected ${scores.contextAnalysis.fillerFidgetCount} time(s) during filler word segments. Practice pausing briefly instead.`
          : 'Reduce filler words and keep your gaze toward the camera (audience).',
        scores.contextAnalysis.keywordGestureMisses > 0
          ? `No gestures were used when explaining key keywords ${scores.contextAnalysis.keywordGestureMisses} time(s). Try emphasizing important concepts with hand gestures.`
          : 'Try adding evidence when answering questions on weak areas.',
      ],
    };
  }

  const parsed = await chatJson<ReportNarrative>('gpt-4o', sys, 'The data is in the system message above.');
  if (!parsed?.strengths?.length) {
    return {
      strengths: [
        `Could not generate a summary based on a composite score of ${scores.compositeScore}.`,
        `Speech: ${scores.speechScore}, Nonverbal: ${scores.nonverbalScore}, Q&A: ${scores.qaScore}.`,
      ],
      improvements: ['Check the API response format or try again later.'],
    };
  }
  return parsed;
}
