import type { TranscriptEntry, WordEmphasisEntry } from '../types/session';

/** 인식 final이 녹화 종료 직후에 도착하는 경우까지 포함 */
const RECORDING_POST_ROLL_MS = 5000;

export interface ReplaySubtitleCue {
  startSec: number;
  endSec: number;
  words: { word: string; rms: number }[];
  /** 볼륨 기반 강세가 없으면 전부 동일 색(중립)으로 표시 */
  hasVolume: boolean;
}

function clipRange(startMs: number, endMs: number, recStart: number, recEnd: number): { a: number; b: number } | null {
  const a = Math.max(startMs, recStart);
  const b = Math.min(endMs, recEnd);
  if (b <= a) return null;
  return { a, b };
}

/**
 * 녹화 구간 [recordingStartMs, recordingEndMs]에 대해 전사·단어 강세 로그로 재생용 자막 큐를 만듭니다.
 * - word_emphasis_log 우선(말의 강세 색)
 * - 같은 구간 전사만 있고 강세 로그가 없으면 전사 큐만 추가(중립 색)
 */
export function buildReplaySubtitles(
  recordingStartMs: number,
  recordingEndMs: number,
  wordEmphasisLog: WordEmphasisEntry[],
  transcriptLog: TranscriptEntry[],
): ReplaySubtitleCue[] {
  const cues: ReplaySubtitleCue[] = [];
  const recStart = recordingStartMs;
  /** 재생 타임라인 상 녹화 종료(영상 길이에 맞춤) */
  const timelineEnd = recordingEndMs;
  /** 로그 수집: 종료 직후 늦게 도착한 final 전사까지 포함 */
  const logEnd = recordingEndMs + RECORDING_POST_ROLL_MS;

  const emphIn = wordEmphasisLog
    .filter((e) => e.timestamp >= recStart && e.timestamp <= logEnd)
    .sort((a, b) => a.timestamp - b.timestamp);

  for (const e of emphIn) {
    const words = e.words.map((w) => w.word.trim()).filter(Boolean);
    if (words.length === 0) continue;
    const est = Math.max(words.length * 400, 600);
    const phraseEnd = e.timestamp;
    const phraseStart = phraseEnd - est;
    const clipped = clipRange(phraseStart, phraseEnd, recStart, timelineEnd);
    if (!clipped) continue;
    const hasVolume = e.words.some((w) => w.rms > 0);
    cues.push({
      startSec: (clipped.a - recStart) / 1000,
      endSec: (clipped.b - recStart) / 1000,
      words: e.words.filter((w) => w.word.trim()).map((w) => ({ word: w.word.trim(), rms: w.rms })),
      hasVolume,
    });
  }

  const transIn = transcriptLog
    .filter((t) => t.timestamp >= recStart && t.timestamp <= logEnd)
    .sort((a, b) => a.timestamp - b.timestamp);

  for (const t of transIn) {
    const w = t.text.trim().split(/\s+/).filter(Boolean);
    if (w.length === 0) continue;
    const covered = emphIn.some((e) => Math.abs(e.timestamp - t.timestamp) < 700);
    if (covered) continue;

    const est = Math.max(w.length * 400, 600);
    const phraseEnd = Math.min(t.timestamp, timelineEnd);
    const phraseStart = phraseEnd - est;
    const clipped = clipRange(phraseStart, phraseEnd, recStart, timelineEnd);
    if (!clipped) continue;

    cues.push({
      startSec: (clipped.a - recStart) / 1000,
      endSec: (clipped.b - recStart) / 1000,
      words: w.map((word) => ({ word, rms: 0 })),
      hasVolume: false,
    });
  }

  cues.sort((x, y) => x.startSec - y.startSec);
  return cues;
}
