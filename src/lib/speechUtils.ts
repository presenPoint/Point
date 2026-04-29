import type { TranscriptEntry } from '../types/session';

/** 최근 인식 버퍼에서 일정 시간 안의 발화만 이어 붙여 스니펫 문자열을 만듭니다. */
export function recentTranscriptPlain(
  buffer: TranscriptEntry[],
  windowMs: number,
  maxChars: number,
): string {
  const now = Date.now();
  const parts = buffer
    .filter((e) => now - e.timestamp <= windowMs)
    .map((e) => e.text.trim())
    .filter(Boolean);
  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

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
