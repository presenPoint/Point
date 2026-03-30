/**
 * Agent 2-A — Speech Rule Engine. 규격: ../AGENT.md
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
} from '../../../lib/speechUtils';
import type { TranscriptEntry, FillerEntry } from '../../../types/session';

export function calcWpm(buffer: TranscriptEntry[]): number {
  const now = Date.now();
  const window = buffer.filter((e) => now - e.timestamp < WINDOW_MS);
  const syllableCount = window.reduce((acc, e) => acc + countSyllables(e.text), 0);
  if (window.length === 0) return 0;
  const span = Math.min(WINDOW_MS, now - (window[0]?.timestamp ?? now));
  if (span <= 0) return 0;
  return Math.round((syllableCount / span) * 60_000);
}

export function onTranscriptChunk(
  text: string,
  buffer: TranscriptEntry[],
  fillerHistory: FillerEntry[],
  lastWpmWarnAt: { current: number }
): void {
  const now = Date.now();
  buffer.push({ text, timestamp: now });

  const wpm = calcWpm(buffer);
  if (wpm > TARGET_WPM_MAX && now - lastWpmWarnAt.current > 15_000) {
    lastWpmWarnAt.current = now;
    feedbackQueue.push({
      level: 'WARN',
      msg: '말이 너무 빠릅니다',
      source: 'SPEECH_RULE',
      cooldown: 15_000,
    });
  } else if (wpm > 0 && wpm < TARGET_WPM_MIN && now - lastWpmWarnAt.current > 15_000) {
    lastWpmWarnAt.current = now;
    feedbackQueue.push({
      level: 'WARN',
      msg: '조금 더 빠르게 말해보세요',
      source: 'SPEECH_RULE',
      cooldown: 15_000,
    });
  }

  const matches = text.match(FILLER_PATTERN) ?? [];
  matches.forEach((m) => {
    fillerHistory.push({ word: m.trim(), timestamp: Date.now() });
    feedbackQueue.push({
      level: 'INFO',
      msg: `추임새 감지: "${m.trim()}"`,
      source: 'SPEECH_RULE',
      cooldown: 30_000,
      silent: true,
    });
  });

  const recentCount = fillerHistory.filter((e) => Date.now() - e.timestamp < FILLER_WINDOW_MS).length;
  if (recentCount >= FILLER_THRESHOLD) {
    feedbackQueue.push({
      level: 'WARN',
      msg: '추임새가 반복되고 있어요',
      source: 'SPEECH_RULE',
      cooldown: 30_000,
    });
  }
}
