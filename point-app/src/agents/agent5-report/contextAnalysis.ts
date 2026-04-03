import type { SessionContext, TranscriptEntry, GestureEntry } from '../../types/session';

export interface ContextInsight {
  timestamp: number;
  type: 'keyword_gesture' | 'keyword_still' | 'filler_fidget' | 'long_freeze' | 'good_rhythm';
  description: string;
}

export interface ContextAnalysisResult {
  insights: ContextInsight[];
  keywordGestureHits: number;
  keywordGestureMisses: number;
  fillerFidgetCount: number;
  freezeCount: number;
  rhythmScore: number;
  contextScore: number;
}

const WINDOW_MS = 2500;

function findKeywordMoments(
  transcriptLog: TranscriptEntry[],
  keywords: string[],
): { timestamp: number; keyword: string }[] {
  const moments: { timestamp: number; keyword: string }[] = [];
  const lowerKeywords = keywords.map((k) => k.toLowerCase());

  for (const entry of transcriptLog) {
    const text = entry.text.toLowerCase();
    for (const kw of lowerKeywords) {
      if (text.includes(kw)) {
        moments.push({ timestamp: entry.timestamp, keyword: keywords[lowerKeywords.indexOf(kw)] });
      }
    }
  }
  return moments;
}

function hasGestureNear(gestureLog: GestureEntry[], timestamp: number): boolean {
  return gestureLog.some(
    (g) => Math.abs(g.timestamp - timestamp) <= WINDOW_MS
  );
}

function hasAnyMovementNear(
  postureLog: { timestamp: number; angle: number }[],
  timestamp: number,
): boolean {
  const nearby = postureLog.filter((p) => Math.abs(p.timestamp - timestamp) <= WINDOW_MS);
  if (nearby.length < 2) return false;
  const angles = nearby.map((p) => p.angle);
  const range = Math.max(...angles) - Math.min(...angles);
  return range > 2;
}

function calcRhythmScore(gestureLog: GestureEntry[], durationSec: number): number {
  if (durationSec < 30) return 70;

  const bucketSize = 15_000;
  const bucketCount = Math.max(1, Math.ceil((durationSec * 1000) / bucketSize));
  const buckets = new Array(bucketCount).fill(0);

  const startTime = gestureLog.length > 0
    ? Math.min(...gestureLog.map((g) => g.timestamp))
    : 0;

  for (const g of gestureLog) {
    const idx = Math.min(bucketCount - 1, Math.floor((g.timestamp - startTime) / bucketSize));
    buckets[idx]++;
  }

  const activeBuckets = buckets.filter((c) => c > 0).length;
  const distribution = activeBuckets / bucketCount;

  const avgPerBucket = gestureLog.length / bucketCount;
  const variance = buckets.reduce((sum, c) => sum + (c - avgPerBucket) ** 2, 0) / bucketCount;
  const cv = avgPerBucket > 0 ? Math.sqrt(variance) / avgPerBucket : 0;

  const distributionScore = Math.min(100, distribution * 120);
  const evenness = Math.max(0, 100 - cv * 40);

  return Math.round(distributionScore * 0.6 + evenness * 0.4);
}

function detectFreezes(
  postureLog: { timestamp: number }[],
  gestureLog: GestureEntry[],
  durationSec: number,
): ContextInsight[] {
  const insights: ContextInsight[] = [];
  if (postureLog.length < 10 || durationSec < 30) return insights;

  const allTimestamps = [...postureLog.map((p) => p.timestamp), ...gestureLog.map((g) => g.timestamp)];
  allTimestamps.sort((a, b) => a - b);

  for (let i = 1; i < allTimestamps.length; i++) {
    const gap = allTimestamps[i] - allTimestamps[i - 1];
    if (gap > 30_000) {
      insights.push({
        timestamp: allTimestamps[i - 1],
        type: 'long_freeze',
        description: `${Math.round(gap / 1000)} seconds of minimal movement`,
      });
    }
  }
  return insights;
}

export function analyzeContext(ctx: SessionContext): ContextAnalysisResult {
  const { transcript_log, filler_timestamps, total_duration_sec } = ctx.speech_coaching;
  const { gesture_log, posture_log } = ctx.nonverbal_coaching;
  const { keywords } = ctx.material;

  const insights: ContextInsight[] = [];
  let keywordGestureHits = 0;
  let keywordGestureMisses = 0;

  const keywordMoments = findKeywordMoments(transcript_log, keywords);

  for (const km of keywordMoments) {
    const hasGesture = hasGestureNear(gesture_log, km.timestamp);
    const hasMovement = hasAnyMovementNear(posture_log, km.timestamp);

    if (hasGesture || hasMovement) {
      keywordGestureHits++;
      insights.push({
        timestamp: km.timestamp,
        type: 'keyword_gesture',
        description: `'${km.keyword}' accompanied by appropriate gesture`,
      });
    } else {
      keywordGestureMisses++;
      insights.push({
        timestamp: km.timestamp,
        type: 'keyword_still',
        description: `'${km.keyword}' no gesture, static position`,
      });
    }
  }

  let fillerFidgetCount = 0;
  for (const ft of filler_timestamps) {
    if (hasGestureNear(gesture_log, ft)) {
      fillerFidgetCount++;
      insights.push({
        timestamp: ft,
        type: 'filler_fidget',
        description: 'Nervous movement detected during filler word',
      });
    }
  }

  const freezeInsights = detectFreezes(posture_log, gesture_log, total_duration_sec);
  insights.push(...freezeInsights);

  const rhythmScore = calcRhythmScore(gesture_log, total_duration_sec);

  if (rhythmScore >= 70) {
    insights.push({
      timestamp: 0,
      type: 'good_rhythm',
      description: 'Even gesture distribution throughout presentation',
    });
  }

  const totalKeywordMoments = keywordGestureHits + keywordGestureMisses;
  const keywordMatchRate = totalKeywordMoments > 0
    ? keywordGestureHits / totalKeywordMoments
    : 0.5;

  const fidgetPenalty = Math.min(30, fillerFidgetCount * 8);
  const freezePenalty = Math.min(20, freezeInsights.length * 10);

  const contextScore = Math.max(0, Math.min(100, Math.round(
    keywordMatchRate * 40 +
    rhythmScore * 0.4 -
    fidgetPenalty -
    freezePenalty
  )));

  return {
    insights: insights.slice(0, 20),
    keywordGestureHits,
    keywordGestureMisses,
    fillerFidgetCount,
    freezeCount: freezeInsights.length,
    rhythmScore,
    contextScore,
  };
}
