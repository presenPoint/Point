import type { TranscriptEntry, VolumeSample } from '../types/session';

export type TranscriptCaptureHint =
  | 'browser_unsupported'
  | 'permission_blocked'
  | 'stt_no_segments'
  | 'no_audio';

export function transcriptStats(
  entries: TranscriptEntry[],
  liveDraft?: string,
): { plain: string; chars: number; segments: number } {
  const plain = transcriptPlain(entries, liveDraft);
  const segments = entries.filter((e) => (typeof e.text === 'string' ? e.text : '').trim().length > 0).length;
  const draftLen = (liveDraft ?? '').trim().length;
  return {
    plain,
    chars: plain.length,
    segments: segments > 0 ? segments : draftLen > 0 ? 1 : 0,
  };
}

/** 음성(볼륨)은 잡혔는데 전사 구간이 없을 때 — STT 미확정 vs 무음 구분 */
export function hadActiveSpeechVolume(
  samples: VolumeSample[],
  minHits = 20,
  rmsThreshold = 0.05,
): boolean {
  let hits = 0;
  for (const s of samples) {
    if (s.rms >= rmsThreshold) {
      hits += 1;
      if (hits >= minHits) return true;
    }
  }
  return false;
}

/** Single flowing line (good for AI / search). */
export function transcriptPlain(entries: TranscriptEntry[], liveDraft?: string): string {
  const fromLog = entries
    .map((e) => e.text.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const draft = (liveDraft ?? '').trim();
  if (!fromLog) return draft;
  if (!draft) return fromLog;
  if (draft.startsWith(fromLog) || fromLog.startsWith(draft)) {
    return draft.length >= fromLog.length ? draft : fromLog;
  }
  return `${fromLog} ${draft}`.replace(/\s+/g, ' ').trim();
}

/** One line per final recognition result with elapsed time from session start. */
export function transcriptWithTimestamps(entries: TranscriptEntry[], sessionStartedAt: string): string {
  const start = new Date(sessionStartedAt).getTime();
  return entries
    .filter((e) => e.text.trim())
    .map((e) => {
      const sec = Math.max(0, Math.round((e.timestamp - start) / 1000));
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      const label = `${m}:${String(s).padStart(2, '0')}`;
      return `[${label}] ${e.text.trim()}`;
    })
    .join('\n');
}

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
