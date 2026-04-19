/** Approximate word count for WPM calculation */
export function countSyllables(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

export const WINDOW_MS = 5000;
export const TARGET_WPM_MIN = 250;
export const TARGET_WPM_MAX = 350;

/** English filler word patterns */
export const FILLER_PATTERN = /\b(uh+|um+|er+|ah+|like|you know|basically|actually|so+|well|I mean)\b/gi;

export const FILLER_THRESHOLD = 3;
export const FILLER_WINDOW_MS = 30_000;

export const SILENCE_THRESHOLD_MS = 3000;

export const SEMANTIC_INTERVAL_MS = 30_000;
export const MIN_TRANSCRIPT_LENGTH = 50;
