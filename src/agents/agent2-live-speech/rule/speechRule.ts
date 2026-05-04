/**
 * Agent 2-A — Speech Rule Engine. Spec: ../AGENT.md
 */
import { feedbackQueue } from '../../shared/feedbackQueue';
import {
  collectKoreanFillerMatches,
  countSyllables,
  FILLER_PATTERN,
  FILLER_THRESHOLD,
  FILLER_WINDOW_MS,
  TARGET_WPM_MAX,
  TARGET_WPM_MIN,
  WINDOW_MS,
} from '../../../lib/speechUtils';
import type { TranscriptEntry, FillerEntry } from '../../../types/session';
import type { PersonaConfig } from '../../../constants/personas';

export interface SpeechRuleConfig {
  wpmMin: number;
  wpmMax: number;
  feedbackTone: string;
}

export function getDefaultSpeechConfig(): SpeechRuleConfig {
  return { wpmMin: TARGET_WPM_MIN, wpmMax: TARGET_WPM_MAX, feedbackTone: 'neutral' };
}

export function speechConfigFromPersona(pc: PersonaConfig): SpeechRuleConfig {
  return { wpmMin: pc.wpmRange[0], wpmMax: pc.wpmRange[1], feedbackTone: pc.feedbackTone };
}

export function calcWpm(buffer: TranscriptEntry[]): number {
  const now = Date.now();
  const window = buffer.filter((e) => now - e.timestamp < WINDOW_MS);
  const syllableCount = window.reduce((acc, e) => acc + countSyllables(e.text), 0);
  if (window.length === 0) return 0;
  const span = Math.min(WINDOW_MS, now - (window[0]?.timestamp ?? now));
  if (span <= 0) return 0;
  return Math.round((syllableCount / span) * 60_000);
}

/** UI용 즉시 WPM: 누적 음절 수 샘플 간 델타 / 시간 (5초 창이 아님) */
export interface WpmHistorySample {
  t: number;
  /** 확정 구간 누적 + 현재 interim 음절 수 */
  s: number;
}

export function calcInstantWpmFromHistory(
  hist: WpmHistorySample[],
  opts?: { minSpanMs?: number; maxLookbackMs?: number; cap?: number },
): number {
  const minSpanMs = opts?.minSpanMs ?? 140;
  const maxLookbackMs = opts?.maxLookbackMs ?? 1400;
  const cap = opts?.cap ?? 420;
  if (hist.length < 2) return 0;
  const last = hist[hist.length - 1];
  const minT = last.t - maxLookbackMs;
  let i = hist.length - 2;
  while (i >= 0 && hist[i].t >= minT) i--;
  const anchor = hist[Math.max(0, i)];
  const rawSpan = last.t - anchor.t;
  if (rawSpan < 45) return 0;
  const span = Math.max(rawSpan, minSpanMs);
  const delta = last.s - anchor.s;
  if (delta <= 0) return 0;
  const raw = (delta / span) * 60_000;
  return Math.min(cap, Math.round(raw));
}

/** final 버퍼 + 현재 interim 한 줄(중복 없이 WPM용) */
export function bufferWithInterim(
  base: TranscriptEntry[],
  interimText: string,
  interimAnchorMs: number | null,
): TranscriptEntry[] {
  const it = interimText.trim();
  if (!it || interimAnchorMs == null) return base;
  return [...base, { text: it, timestamp: interimAnchorMs }];
}

const FILLER_DEDUPE_MS = 450;

function pushFillersFromText(
  text: string,
  fillerHistory: FillerEntry[],
  config: SpeechRuleConfig,
  speechSnap: () => string | undefined,
): void {
  const eng = text.match(FILLER_PATTERN) ?? [];
  const kor = collectKoreanFillerMatches(text);
  const matches = [...eng, ...kor];
  const now = Date.now();
  matches.forEach((raw) => {
    const word = raw.trim();
    if (!word) return;
    const dup = fillerHistory.some((f) => f.word === word && now - f.timestamp < FILLER_DEDUPE_MS);
    if (dup) return;
    fillerHistory.push({ word, timestamp: Date.now() });
    feedbackQueue.push({
      level: 'INFO',
      msg: `Filler word detected: "${word}"`,
      source: 'SPEECH_RULE',
      cooldown: 30_000,
      silent: true,
    });
  });

  const recentCount = fillerHistory.filter((e) => Date.now() - e.timestamp < FILLER_WINDOW_MS).length;
  if (recentCount >= FILLER_THRESHOLD) {
    feedbackQueue.push({
      level: 'WARN',
      msg:
        config.feedbackTone === 'sharp'
          ? 'Too many fillers — every "um" costs you credibility'
          : config.feedbackTone === 'warm'
            ? 'I\'m hearing some filler words — try pausing instead'
            : 'Filler words are being repeated',
      source: 'SPEECH_RULE',
      cooldown: 30_000,
      speechSnippet: speechSnap(),
    });
  }
}

export function evaluateWpmWarningsForRate(
  wpm: number,
  lastWpmWarnAt: { current: number },
  config: SpeechRuleConfig,
  speechSnap: () => string | undefined,
): void {
  const now = Date.now();
  if (wpm > config.wpmMax && now - lastWpmWarnAt.current > 15_000) {
    lastWpmWarnAt.current = now;
    feedbackQueue.push({
      level: 'WARN',
      msg: toneMsg(config.feedbackTone, 'fast', ''),
      source: 'SPEECH_RULE',
      cooldown: 15_000,
      speechSnippet: speechSnap(),
    });
  } else if (wpm > 0 && wpm < config.wpmMin && now - lastWpmWarnAt.current > 15_000) {
    lastWpmWarnAt.current = now;
    feedbackQueue.push({
      level: 'WARN',
      msg: toneMsg(config.feedbackTone, '', 'slow'),
      source: 'SPEECH_RULE',
      cooldown: 15_000,
      speechSnippet: speechSnap(),
    });
  }
}

/** interim 델타에서만 필러 검사 (WPM 경고는 호출부에서 즉시 WPM으로 처리) */
export function onInterimSpeechTick(
  suffix: string,
  fillerHistory: FillerEntry[],
  config: SpeechRuleConfig = getDefaultSpeechConfig(),
  speechSnap: () => string | undefined,
): void {
  if (suffix.trim()) {
    pushFillersFromText(suffix, fillerHistory, config, speechSnap);
  }
}

function toneMsg(tone: string, fast: string, slow: string): string {
  const prefix: Record<string, [string, string]> = {
    sharp: ['Cut the speed — your words are blurring together', 'Too slow — you\'re losing momentum'],
    encouraging: ['Ease up a little — let your words land', 'Pick up the pace — carry the energy forward'],
    precise: ['Reduce speed for clarity', 'Increase pace to maintain engagement'],
    warm: ['Slow down — let the audience breathe with you', 'A little faster — keep the conversation flowing'],
    empowering: ['Rein it in — power needs control', 'Bring more energy — own the room'],
  };
  const pair = prefix[tone];
  return pair ? pair[fast ? 0 : 1] : (fast ? fast : slow);
}

export function onTranscriptChunk(
  text: string,
  buffer: TranscriptEntry[],
  fillerHistory: FillerEntry[],
  config: SpeechRuleConfig = getDefaultSpeechConfig(),
  speechSnap: () => string | undefined,
): void {
  const now = Date.now();
  buffer.push({ text, timestamp: now });
  pushFillersFromText(text, fillerHistory, config, speechSnap);
}
