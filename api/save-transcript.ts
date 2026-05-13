import { put } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sessionId, userId, transcriptText } = req.body as {
      sessionId?: string;
      userId?: string;
      transcriptText?: string;
    };

    if (!sessionId || !transcriptText) {
      return res.status(400).json({ error: 'sessionId and transcriptText are required' });
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      console.error('save-transcript: BLOB_READ_WRITE_TOKEN is not set');
      return res.status(503).json({
        error: 'Blob storage is not configured',
        hint: 'Add BLOB_READ_WRITE_TOKEN in Vercel project environment variables.',
      });
    }

    const filename = `transcripts/${userId ?? 'unknown'}/${sessionId}.txt`;

    const blob = await put(filename, transcriptText, {
      access: 'public',
      contentType: 'text/plain; charset=utf-8',
      token,
    });

    return res.status(200).json({ url: blob.url });
  } catch (err) {
    console.error('save-transcript', err);
    return res.status(500).json({
      error: 'Transcript save failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
