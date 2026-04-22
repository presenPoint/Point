import { put } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionId, userId, transcriptText } = req.body as {
    sessionId?: string;
    userId?: string;
    transcriptText?: string;
  };

  if (!sessionId || !transcriptText) {
    return res.status(400).json({ error: 'sessionId and transcriptText are required' });
  }

  const filename = `transcripts/${userId ?? 'unknown'}/${sessionId}.txt`;

  const blob = await put(filename, transcriptText, {
    access: 'public',
    contentType: 'text/plain; charset=utf-8',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  return res.status(200).json({ url: blob.url });
}
