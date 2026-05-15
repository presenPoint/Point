import type { TranscriptEntry } from '../types/session';

function formatTranscript(
  sessionId: string,
  userId: string,
  entries: TranscriptEntry[],
  durationSec: number,
): string {
  const lines: string[] = [];
  const date = new Date().toLocaleString('en-US', { timeZone: 'UTC' });

  lines.push('=== Presentation transcript ===');
  lines.push(`Session ID: ${sessionId}`);
  lines.push(`User: ${userId}`);
  lines.push(`Exported: ${date}`);
  lines.push(`Total duration: ${Math.floor(durationSec / 60)}m ${durationSec % 60}s`);
  lines.push(`Utterances: ${entries.length}`);
  lines.push('');
  lines.push('--- Transcript ---');
  lines.push('');

  if (entries.length === 0) {
    lines.push('(No utterances recorded)');
  } else {
    const start = entries[0].timestamp;
    for (const entry of entries) {
      const elapsed = Math.round((entry.timestamp - start) / 1000);
      const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const s = (elapsed % 60).toString().padStart(2, '0');
      lines.push(`[${m}:${s}] ${entry.text}`);
    }
  }

  return lines.join('\n');
}

export async function saveTranscriptToBlob(
  sessionId: string,
  userId: string,
  transcriptLog: TranscriptEntry[],
  durationSec: number,
): Promise<string | null> {
  if (import.meta.env.DEV) return null;

  const transcriptText = formatTranscript(sessionId, userId, transcriptLog, durationSec);

  try {
    const res = await fetch('/api/save-transcript', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, userId, transcriptText }),
    });

    if (!res.ok) {
      console.error('Transcript save failed:', await res.text());
      return null;
    }

    const data = (await res.json()) as { url?: string };
    return data.url ?? null;
  } catch (err) {
    console.error('Transcript save error:', err);
    return null;
  }
}
