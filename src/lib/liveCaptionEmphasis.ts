import type { VolumeSample } from '../types/session';

export interface WordRms {
  word: string;
  rms: number;
}

/**
 * 구간 끝 시각(endTs) 기준으로 최근 볼륨 샘플을 단어 수에 맞게 균등 분할해 단어별 평균 RMS를 추정합니다.
 * (세션 로그용 `useLivePresenting`과 동일한 휴리스틱)
 */
export function buildWordVolumeProfile(
  phrase: string,
  samples: VolumeSample[],
  endTs: number,
): WordRms[] {
  const words = phrase.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const estDurationMs = Math.max(words.length * 400, 600);
  const tStart = endTs - estDurationMs;
  const volSamples = samples.filter((s) => s.timestamp >= tStart && s.timestamp <= endTs);
  if (volSamples.length < 2) {
    return words.map((word) => ({ word, rms: 0 }));
  }
  const perWord = volSamples.length / words.length;
  return words.map((word, i) => {
    const from = Math.floor(i * perWord);
    const to = Math.max(from + 1, Math.floor((i + 1) * perWord));
    const slice = volSamples.slice(from, to);
    const rms =
      slice.length > 0 ? Math.max(...slice.map((s) => s.rms)) : 0;
    return { word, rms };
  });
}

export type EmphasisTier = 'high' | 'mid' | 'low';

/** 구절 내 상대 차이가 거의 없으면 티어 분리 안 함 */
export const MIN_EMPHASIS_SPREAD = 0.12;

/**
 * 구절(phrase) 안에서 단어별 high / mid / low.
 * 예전 방식(최대 대비 65% 이상 = 전부 high)은 볼륨이 평탄할 때 전부 노란색이 됨.
 */
export function emphasisTiersForPhrase(wordRmss: WordRms[]): EmphasisTier[] {
  const n = wordRmss.length;
  if (n === 0) return [];
  const maxR = Math.max(...wordRmss.map((w) => w.rms), 0);
  if (maxR <= 0) return wordRmss.map(() => 'low');
  if (n === 1) return ['mid'];
  if (emphasisSpread(wordRmss) < MIN_EMPHASIS_SPREAD) {
    return wordRmss.map(() => 'mid');
  }

  const ranked = wordRmss.map((w, i) => ({ i, rms: w.rms })).sort((a, b) => b.rms - a.rms);
  const tiers = new Array<EmphasisTier>(n).fill('mid');
  const highN = Math.max(1, Math.round(n * 0.22));
  const lowN = Math.max(1, Math.round(n * 0.28));
  for (let k = 0; k < highN && k < n; k++) tiers[ranked[k].i] = 'high';
  for (let k = 0; k < lowN && k < n; k++) tiers[ranked[n - 1 - k].i] = 'low';
  return tiers;
}

/** 단어 하나만 있을 때 — 구절 배치용 {@link emphasisTiersForPhrase} 권장 */
export function emphasisTierForWord(rms: number, maxRms: number): EmphasisTier {
  if (maxRms <= 0) return 'low';
  const rel = rms / maxRms;
  if (rel >= 0.88) return 'high';
  if (rel >= 0.55) return 'mid';
  return 'low';
}

export function relativeIntensityPercent(rms: number, maxRms: number): number {
  if (maxRms <= 0) return 0;
  return Math.round(Math.min(100, Math.max(0, (rms / maxRms) * 100)));
}

/** max(rel)-min(rel), rel = rms/maxRms */
export function emphasisSpread(wordRmss: WordRms[]): number {
  const maxR = Math.max(...wordRmss.map((w) => w.rms), 0);
  if (maxR <= 0 || wordRmss.length < 2) return 0;
  const rels = wordRmss.map((w) => w.rms / maxR);
  return Math.max(...rels) - Math.min(...rels);
}
