import type { TranscriptEntry } from '../types/session';

function formatTranscript(
  sessionId: string,
  userId: string,
  entries: TranscriptEntry[],
  durationSec: number,
): string {
  const lines: string[] = [];
  const date = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

  lines.push(`=== 발표 스크립트 ===`);
  lines.push(`세션 ID: ${sessionId}`);
  lines.push(`사용자: ${userId}`);
  lines.push(`기록 일시: ${date}`);
  lines.push(`총 발표 시간: ${Math.floor(durationSec / 60)}분 ${durationSec % 60}초`);
  lines.push(`발화 횟수: ${entries.length}회`);
  lines.push('');
  lines.push('--- 발화 내용 ---');
  lines.push('');

  if (entries.length === 0) {
    lines.push('(기록된 발화 없음)');
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
