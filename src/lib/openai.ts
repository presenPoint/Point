const BROWSER_KEY = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;

const SERVER_PROXY_FLAG =
  import.meta.env.VITE_OPENAI_SERVER_PROXY === '1' ||
  import.meta.env.VITE_OPENAI_SERVER_PROXY === 'true';

/**
 * Chat / embeddings / speech / Whisper proxy: same-origin `/api/*` (needs `OPENAI_API_KEY` on the server).
 * - Production build (`import.meta.env.PROD`): on by default (Vercel 등에서 브라우저 직접 OpenAI 호출 불가).
 * - Dev (`vite`): off unless `VITE_OPENAI_SERVER_PROXY=1` or `vercel dev`로 `/api`를 붙임.
 * - `VITE_OPENAI_SERVER_PROXY=0` 또는 `false`면 프로덕션에서도 프록시 끔(드물게 `VITE_OPENAI_API_KEY`만 쓸 때).
 */
function useServerProxy(): boolean {
  if (
    import.meta.env.VITE_OPENAI_SERVER_PROXY === '0' ||
    import.meta.env.VITE_OPENAI_SERVER_PROXY === 'false'
  ) {
    return false;
  }
  if (SERVER_PROXY_FLAG) return true;
  return import.meta.env.PROD;
}

/** 브라우저 키가 있거나, 서버 프록시 경로를 쓰는 경우 true. */
export function hasOpenAI(): boolean {
  return Boolean(BROWSER_KEY || useServerProxy());
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunk) as unknown as number[],
    );
  }
  return btoa(binary);
}

/**
 * Whisper: browser → /api/transcribe-audio (proxy) or direct when only VITE key is set.
 */
export async function transcribeAudioBlob(blob: Blob, ext: string): Promise<string> {
  if (useServerProxy()) {
    const audioBase64 = arrayBufferToBase64(await blob.arrayBuffer());
    const res = await fetch('/api/transcribe-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64, ext }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Transcription API error (${res.status}): ${t}`);
    }
    const data = (await res.json()) as { text?: string; error?: unknown };
    if (data.error) {
      throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
    }
    return data.text?.trim() ?? '';
  }

  if (!BROWSER_KEY) {
    throw new Error('OpenAI is not configured (set VITE_OPENAI_API_KEY or VITE_OPENAI_SERVER_PROXY=1 + server OPENAI_API_KEY).');
  }

  const formData = new FormData();
  formData.append('file', blob, `audio.${ext}`);
  formData.append('model', 'whisper-1');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${BROWSER_KEY}` },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Whisper API error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { text?: string };
  return data.text?.trim() ?? '';
}

/** Raw assistant text from chat/completions (e.g. Q&A question text, non-JSON). */
export async function chatCompletionText(
  model: string,
  system: string,
  user: string,
  temperature: number,
): Promise<string | null> {
  if (!hasOpenAI()) return null;

  const openai = {
    model,
    temperature,
    messages: [
      { role: 'system' as const, content: system },
      { role: 'user' as const, content: user },
    ],
  };

  try {
    let res: Response;
    if (useServerProxy()) {
      res = await fetch('/api/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route: 'chat', openai }),
      });
    } else {
      if (!BROWSER_KEY) return null;
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${BROWSER_KEY}`,
        },
        body: JSON.stringify(openai),
      });
    }

    if (!res.ok) {
      console.error('chatCompletionText', await res.text());
      return null;
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (e) {
    console.error('chatCompletionText request failed', e);
    return null;
  }
}

export async function chatJson<T>(
  model: 'gpt-4o' | 'gpt-4o-mini',
  system: string,
  user: string,
): Promise<T | null> {
  if (!hasOpenAI()) return null;

  const openai = {
    model,
    temperature: 0.4,
    messages: [
      { role: 'system' as const, content: system },
      { role: 'user' as const, content: user },
    ],
  };

  try {
    let res: Response;
    if (useServerProxy()) {
      res = await fetch('/api/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route: 'chat', openai }),
      });
    } else {
      if (!BROWSER_KEY) return null;
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${BROWSER_KEY}`,
        },
        body: JSON.stringify(openai),
      });
    }

    if (!res.ok) {
      console.error('OpenAI error', await res.text());
      return null;
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? '';
    const jsonStr = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    try {
      return JSON.parse(jsonStr) as T;
    } catch {
      console.error('JSON parse fail', raw);
      return null;
    }
  } catch (e) {
    console.error('OpenAI chatJson request failed', e);
    return null;
  }
}

/**
 * Generate a 1536-dimension embedding vector using text-embedding-3-small.
 * Returns null when not configured or request fails.
 */
export async function embedText(text: string): Promise<number[] | null> {
  if (!hasOpenAI()) return null;

  const openai = {
    model: 'text-embedding-3-small',
    input: text.slice(0, 8_000),
  };

  try {
    let res: Response;
    if (useServerProxy()) {
      res = await fetch('/api/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route: 'embeddings', openai }),
      });
    } else {
      if (!BROWSER_KEY) return null;
      res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${BROWSER_KEY}`,
        },
        body: JSON.stringify(openai),
      });
    }

    if (!res.ok) {
      console.error('OpenAI embeddings error', await res.text());
      return null;
    }
    const data = (await res.json()) as {
      data?: Array<{ embedding: number[] }>;
    };
    return data.data?.[0]?.embedding ?? null;
  } catch (e) {
    console.error('OpenAI embedText request failed', e);
    return null;
  }
}

/** GPT-4o mini TTS — returns MP3 blob. `instructions`는 gpt-4o-mini-tts 전용. */
export async function createSpeechAudio(params: {
  input: string;
  voice?: string;
  instructions?: string;
}): Promise<Blob | null> {
  if (!hasOpenAI()) return null;

  const input = params.input.trim().slice(0, 4096);
  if (!input) return null;

  const openai = {
    model: 'gpt-4o-mini-tts',
    voice: params.voice ?? 'coral',
    input,
    instructions:
      params.instructions ??
      'Speak clearly as a concise presentation coach. Match the language of the input text.',
    response_format: 'mp3',
  };

  try {
    let res: Response;
    if (useServerProxy()) {
      res = await fetch('/api/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route: 'speech', openai }),
      });
    } else {
      if (!BROWSER_KEY) return null;
      res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${BROWSER_KEY}`,
        },
        body: JSON.stringify(openai),
      });
    }

    if (!res.ok) {
      console.error('OpenAI speech error', await res.text());
      return null;
    }
    return res.blob();
  } catch (e) {
    console.error('OpenAI createSpeechAudio failed', e);
    return null;
  }
}
