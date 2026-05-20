import type { TranscriptEntry } from '../types/session';
import type { AppLocale } from '../store/localeStore';
import type { PersonaConfig } from '../constants/personas';

export type PaceUnit = 'wpm' | 'spm';

/** 발화로 인정하는 최근 활동(ms) — 이보다 길게 무음이면 속도 분모에서 제외 */
export const SPEECH_ACTIVITY_GAP_MS = 900;

export const PACE_WINDOW_MS = 5000;

/** 영어 일반 발표(페르소나 미선택) */
export const DEFAULT_WPM_RANGE: [number, number] = [130, 170];

/** 한국어 일반 발표(페르소나 미선택) — 음절/분, 대학·컨퍼런스 평균대 */
export const DEFAULT_SPM_RANGE: [number, number] = [280, 360];

export interface PaceRange {
  min: number;
  max: number;
  unit: PaceUnit;
  locale: AppLocale;
}

/** 한국어: 한글 음절 + 라틴 단어(약어·숫자 발화). 영어: 공백 단어 수 */
export function countSpeechUnits(text: string, locale: AppLocale): number {
  const t = text.trim();
  if (!t) return 0;
  if (locale === 'ko') {
    const hangul = (t.match(/[\uac00-\ud7a3]/g) ?? []).length;
    const latinWords = (t.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? []).length;
    const digits = (t.match(/\d+/g) ?? []).length;
    return hangul + latinWords + digits;
  }
  return t.split(/\s+/).filter(Boolean).length;
}

/** @deprecated — use countSpeechUnits */
export function countSyllables(text: string, locale: AppLocale = 'en'): number {
  return countSpeechUnits(text, locale);
}

export function getDefaultPaceRange(locale: AppLocale): PaceRange {
  if (locale === 'ko') {
    const [min, max] = DEFAULT_SPM_RANGE;
    return { min, max, unit: 'spm', locale: 'ko' };
  }
  const [min, max] = DEFAULT_WPM_RANGE;
  return { min, max, unit: 'wpm', locale: 'en' };
}

export function getPersonaPaceRange(config: PersonaConfig, locale: AppLocale): PaceRange {
  if (locale === 'ko') {
    const [min, max] = config.spmRange;
    return { min, max, unit: 'spm', locale: 'ko' };
  }
  const [min, max] = config.wpmRange;
  return { min, max, unit: 'wpm', locale: 'en' };
}

export function isPaceInRange(rate: number, range: PaceRange): boolean {
  return rate > 0 && rate >= range.min && rate <= range.max;
}

export interface PaceHistorySample {
  t: number;
  /** 누적 발화 단위(음절 또는 단어) */
  units: number;
  /** 누적 실제 발화 시간(ms) — 침묵·긴 pause 제외 */
  speakingMs: number;
}

/**
 * 최근 구간 발화 속도. speakingMs 델타가 충분하면 발화 시간 기준, 아니면 벽시계 fallback.
 */
export function calcSpeechRateFromHistory(
  hist: PaceHistorySample[],
  locale: AppLocale,
  opts?: { minSpanMs?: number; maxLookbackMs?: number },
): number {
  const minSpanMs = opts?.minSpanMs ?? 400;
  const maxLookbackMs = opts?.maxLookbackMs ?? PACE_WINDOW_MS;
  const cap = locale === 'ko' ? 480 : 260;

  if (hist.length < 2) return 0;
  const last = hist[hist.length - 1];
  const minT = last.t - maxLookbackMs;
  let i = hist.length - 2;
  while (i >= 0 && hist[i].t >= minT) i--;
  const anchor = hist[Math.max(0, i)];

  const wallSpan = last.t - anchor.t;
  if (wallSpan < 80) return 0;

  const deltaUnits = last.units - anchor.units;
  if (deltaUnits <= 0) return 0;

  const deltaSpeaking = last.speakingMs - anchor.speakingMs;
  const span =
    deltaSpeaking >= minSpanMs ? deltaSpeaking : Math.max(wallSpan, minSpanMs);

  const raw = (deltaUnits / span) * 60_000;
  return Math.min(cap, Math.round(raw));
}

/** 5초 버퍼 기준 발화 속도(리포트·보조용) */
export function calcSpeechRateFromBuffer(
  buffer: TranscriptEntry[],
  locale: AppLocale,
  speakingMsInWindow?: number,
): number {
  const now = Date.now();
  const window = buffer.filter((e) => now - e.timestamp < PACE_WINDOW_MS);
  if (window.length === 0) return 0;

  const units = window.reduce((acc, e) => acc + countSpeechUnits(e.text, locale), 0);
  const wallSpan = Math.min(PACE_WINDOW_MS, now - (window[0]?.timestamp ?? now));
  const speakSpan =
    speakingMsInWindow != null && speakingMsInWindow > 200
      ? Math.min(speakingMsInWindow, wallSpan)
      : wallSpan;

  if (speakSpan <= 0 || units <= 0) return 0;
  const cap = locale === 'ko' ? 480 : 260;
  return Math.min(cap, Math.round((units / speakSpan) * 60_000));
}

/** @deprecated alias */
export function calcInstantWpmFromHistory(
  hist: { t: number; s: number }[],
  opts?: { minSpanMs?: number; maxLookbackMs?: number; cap?: number },
): number {
  const mapped: PaceHistorySample[] = hist.map((h) => ({
    t: h.t,
    units: h.s,
    speakingMs: h.t - (hist[0]?.t ?? h.t),
  }));
  return calcSpeechRateFromHistory(mapped, 'en', opts);
}
