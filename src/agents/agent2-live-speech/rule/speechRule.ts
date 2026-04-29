/**
 * Agent 2-A — Speech Rule Engine. Spec: ../AGENT.md
 */
import { feedbackQueue } from '../../shared/feedbackQueue';
import {
  countSyllables,
  FILLER_PATTERN,
  FILLER_THRESHOLD,
  FILLER_WINDOW_MS,
  TARGET_WPM_MAX,
  TARGET_WPM_MIN,
  WINDOW_MS,
  recentTranscriptPlain,
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
  lastWpmWarnAt: { current: number },
  config: SpeechRuleConfig = getDefaultSpeechConfig(),
): void {
  const now = Date.now();
  buffer.push({ text, timestamp: now });

  const wpm = calcWpm(buffer);
  const speechSnap = () => {
    const s = recentTranscriptPlain(buffer, 25_000, 520);
    return s || undefined;
  };
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

  const matches = text.match(FILLER_PATTERN) ?? [];
  matches.forEach((m) => {
    fillerHistory.push({ word: m.trim(), timestamp: Date.now() });
    feedbackQueue.push({
      level: 'INFO',
      msg: `Filler word detected: "${m.trim()}"`,
      source: 'SPEECH_RULE',
      cooldown: 30_000,
      silent: true,
    });
  });

  const recentCount = fillerHistory.filter((e) => Date.now() - e.timestamp < FILLER_WINDOW_MS).length;
  if (recentCount >= FILLER_THRESHOLD) {
    feedbackQueue.push({
      level: 'WARN',
      msg: config.feedbackTone === 'sharp' ? 'Too many fillers — every "um" costs you credibility'
        : config.feedbackTone === 'warm' ? 'I\'m hearing some filler words — try pausing instead'
        : 'Filler words are being repeated',
      source: 'SPEECH_RULE',
      cooldown: 30_000,
      speechSnippet: speechSnap(),
    });
  }
}
