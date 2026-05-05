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
    const rms = slice.reduce((a, s) => a + s.rms, 0) / slice.length;
    return { word, rms };
  });
}

export type EmphasisTier = 'high' | 'mid' | 'low';

/** 같은 구(문장) 안 최대 RMS 대비 상대 비율로 티어 결정 */
export function emphasisTierForWord(rms: number, maxRms: number): EmphasisTier {
  if (maxRms <= 0) return 'low';
  const rel = rms / maxRms;
  if (rel >= 0.65) return 'high';
  if (rel >= 0.35) return 'mid';
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
