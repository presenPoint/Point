import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Whisper proxy (multipart from browser hits CORS). Client sends base64 + ext.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return res.status(503).json({ error: 'OPENAI_API_KEY is not set on the server' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const audioBase64 = body?.audioBase64 as string | undefined;
    const ext = typeof body?.ext === 'string' && body.ext ? body.ext : 'webm';

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return res.status(400).json({ error: 'audioBase64 is required' });
    }

    const buf = Buffer.from(audioBase64, 'base64');
    if (buf.length === 0) {
      return res.status(400).json({ error: 'empty audio' });
    }

    const mime =
      ext === 'webm'
        ? 'audio/webm'
        : ext === 'ogg'
          ? 'audio/ogg'
          : ext === 'mp4'
            ? 'audio/mp4'
            : 'application/octet-stream';

    const blob = new Blob([buf], { type: mime });
    const form = new FormData();
    form.append('file', blob, `audio.${ext}`);
    form.append('model', 'whisper-1');

    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });

    const text = await r.text();
    res.setHeader('Content-Type', 'application/json');
    return res.status(r.status).send(text);
  } catch (err) {
    console.error('api/transcribe-audio', err);
    return res.status(500).json({
      error: 'transcription failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
