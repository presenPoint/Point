const OPENAI_KEY = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;

export async function chatJson<T>(
  model: 'gpt-4o' | 'gpt-4o-mini',
  system: string,
  user: string
): Promise<T | null> {
  if (!OPENAI_KEY) return null;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
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
}

export function hasOpenAI(): boolean {
  return Boolean(OPENAI_KEY);
}

/**
 * Generate a 1536-dimension embedding vector using text-embedding-3-small.
 * Returns null when no API key is configured.
 */
export async function embedText(text: string): Promise<number[] | null> {
  if (!OPENAI_KEY) return null;
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8_000),
    }),
  });
  if (!res.ok) {
    console.error('OpenAI embeddings error', await res.text());
    return null;
  }
  const data = (await res.json()) as {
    data?: Array<{ embedding: number[] }>;
  };
  return data.data?.[0]?.embedding ?? null;
}

/** GPT-4o mini TTS — returns MP3 blob. `instructions`는 gpt-4o-mini-tts 전용. */
export async function createSpeechAudio(params: {
  input: string;
  voice?: string;
  instructions?: string;
}): Promise<Blob | null> {
  if (!OPENAI_KEY) return null;
  const input = params.input.trim().slice(0, 4096);
  if (!input) return null;
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: params.voice ?? 'coral',
      input,
      instructions:
        params.instructions ??
        'Speak clearly as a concise presentation coach. Match the language of the input text.',
      response_format: 'mp3',
    }),
  });
  if (!res.ok) {
    console.error('OpenAI speech error', await res.text());
    return null;
  }
  return res.blob();
}
