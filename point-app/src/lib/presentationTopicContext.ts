import type { SessionContext } from '../types/session';
import { labelForTopicKey, OTHER_TOPIC_KEY } from '../constants/presentationTopics';

/**
 * Human-readable block for LLM prompts.
 */
export function buildPresentationTopicBlock(ctx: SessionContext): string {
  const keys = ctx.presentation_topic_keys ?? [];
  const custom = (ctx.presentation_topic_custom ?? '').trim();

  const parts: string[] = [];
  for (const k of keys) {
    if (k === OTHER_TOPIC_KEY) continue;
    const lab = labelForTopicKey(k);
    if (lab) parts.push(lab);
  }

  const hasOther = keys.includes(OTHER_TOPIC_KEY);
  if (hasOther && custom) {
    parts.push(`Other (presenter-provided): ${custom}`);
  } else if (hasOther && !custom) {
    parts.push('Other: selected but no custom details entered yet');
  } else if (!hasOther && custom) {
    parts.push(`Additional presenter notes: ${custom}`);
  }

  if (parts.length === 0) {
    return '';
  }

  return [
    'Declared presentation themes (use to infer audience, jargon level, and what counts as on-topic):',
    ...parts.map((p) => `- ${p}`),
    'When judging off-topic or depth, prioritize consistency with these themes alongside the material summary.',
  ].join('\n');
}

/** Short line for compact prompts (e.g. live semantic). */
export function buildPresentationTopicSummaryLine(ctx: SessionContext): string {
  const block = buildPresentationTopicBlock(ctx);
  if (!block) return '';
  return block.replace(/\n+/g, ' · ').slice(0, 500);
}
