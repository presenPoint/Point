import type { TranscriptEntry } from '../types/session';

/** Single flowing line (good for AI / search). */
export function transcriptPlain(entries: TranscriptEntry[]): string {
  return entries
    .map((e) => e.text.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
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
