import { chatJson, hasOpenAI } from '../lib/openai';

export type TranscriptPolishPair = {
  original: string;
  improved: string;
  note?: string;
};

/**
 * Suggests clearer spoken lines aligned with the selected coach persona.
 * "original" should stay close to phrases in the transcript.
 */
export async function suggestTranscriptPolish(
  transcriptPlain: string,
  options: { personaSystemPrompt?: string; coachName: string },
): Promise<TranscriptPolishPair[] | null> {
  if (!hasOpenAI()) return null;
  const clipped = transcriptPlain.replace(/\s+/g, ' ').trim().slice(0, 7000);
  if (clipped.length < 60) return [];

  const personaBlock = options.personaSystemPrompt
    ? `\n[Coach style reference — match priorities and spoken voice when rewriting]\n${options.personaSystemPrompt.slice(0, 12_000)}\n`
    : '';

  const sys = `You tighten spoken presentation lines for clarity and impact.${personaBlock}
Return JSON only in this shape:
{ "pairs": [ { "original": "snippet copied or lightly trimmed from INPUT (one short utterance)", "improved": "same meaning, tighter and more speakable in the coach's style", "note": "optional, max 8 words" } ] }
Rules:
- Pick 6–12 moments that would benefit most (rambling, weak landing, vague setup).
- Each "original" must be a contiguous substring of the INPUT text (after whitespace normalization, close match is OK).
- Improved lines must be easy to say aloud (not essay tone).
- Match the language of the INPUT.`;

  const parsed = await chatJson<{ pairs: TranscriptPolishPair[] }>(
    'gpt-4o-mini',
    sys,
    `Coach label: ${options.coachName}\n\nINPUT TRANSCRIPT:\n${clipped}`,
  );
  if (!parsed?.pairs?.length) return null;
  return parsed.pairs
    .filter((p) => p && typeof p.original === 'string' && typeof p.improved === 'string')
    .map((p) => ({
      original: p.original.trim().slice(0, 420),
      improved: p.improved.trim().slice(0, 420),
      note: p.note ? String(p.note).trim().slice(0, 96) : undefined,
    }))
    .slice(0, 14);
}
