import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Browser-safe OpenAI proxy. Set OPENAI_API_KEY on Vercel (not VITE_*).
 * Client posts JSON: { route: 'chat' | 'embeddings' | 'speech', openai: <OpenAI request body> }.
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
    const route = body?.route as string | undefined;
    const openai = body?.openai;

    if (!route || typeof openai !== 'object') {
      return res.status(400).json({ error: 'Expected { route, openai }' });
    }

    if (route === 'chat') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(openai),
      });
      const text = await r.text();
      res.setHeader('Content-Type', 'application/json');
      return res.status(r.status).send(text);
    }

    if (route === 'embeddings') {
      const r = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(openai),
      });
      const text = await r.text();
      res.setHeader('Content-Type', 'application/json');
      return res.status(r.status).send(text);
    }

    if (route === 'speech') {
      const r = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(openai),
      });
      if (!r.ok) {
        const t = await r.text();
        return res.status(r.status).json({ error: t });
      }
      const buf = Buffer.from(await r.arrayBuffer());
      res.setHeader('Content-Type', r.headers.get('content-type') ?? 'audio/mpeg');
      return res.status(200).send(buf);
    }

    return res.status(400).json({ error: `Unknown route: ${route}` });
  } catch (err) {
    console.error('api/openai', err);
    return res.status(500).json({
      error: 'OpenAI proxy failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
