/** 한글 음절 수 근사 (문서: 음절/분 기준 WPM) */
export function countSyllables(text: string): number {
  const hangul = text.match(/[\uAC00-\uD7A3]/g);
  const hangulCount = hangul?.length ?? 0;
  const latin = text.replace(/[\uAC00-\uD7A3]/g, '');
  const wordParts = latin.trim().split(/\s+/).filter(Boolean);
  const latinSyllables = wordParts.reduce((acc, w) => acc + Math.max(1, Math.ceil(w.length / 3)), 0);
  return hangulCount + latinSyllables;
}

export const WINDOW_MS = 5000;
export const TARGET_WPM_MIN = 250;
export const TARGET_WPM_MAX = 350;

/** 한국어 추임새 (단어 경계 대신 나열 매칭) */
export const FILLER_PATTERN = /(어+|음+|그+|저기|뭐지|있잖아|그러니까|뭐랄까)/g;

export const FILLER_THRESHOLD = 3;
export const FILLER_WINDOW_MS = 30_000;

export const SILENCE_THRESHOLD_MS = 3000;

export const SEMANTIC_INTERVAL_MS = 30_000;
export const MIN_TRANSCRIPT_LENGTH = 50;
