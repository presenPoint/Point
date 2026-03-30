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
