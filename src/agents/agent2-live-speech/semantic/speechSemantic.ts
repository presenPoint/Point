/**
 * Agent 2-B — Speech Semantic Engine. Spec: ../AGENT.md
 */
import { chatJson, hasOpenAI } from '../../../lib/openai';
import { searchSimilarChunks } from '../../../lib/scriptEmbedding';
import { feedbackQueue } from '../../shared/feedbackQueue';
import type { OffTopicEntry } from '../../../types/session';

type SemanticResult = {
  off_topic: boolean;
  off_topic_reason: string;
  logic_break: boolean;
  logic_break_reason: string;
  ambiguous_phrases: string[];
  feedback_message: string | null;
};

const SYSTEM = (
  summary: string,
  history: OffTopicEntry[],
  scriptContext?: string,
  personaPrompt?: string,
) => {
  const scriptBlock = scriptContext
    ? `\n[Relevant script sections — presenter should be covering this content]\n${scriptContext}\n`
    : '';

  const base = `You are a presentation coach. Analyze the presenter's last 30 seconds of speech and respond with JSON only.

Presentation topic summary: ${summary}${scriptBlock}
Previous analysis history: ${JSON.stringify(history.slice(-2))}

Response format:
{
  "off_topic": true/false,
  "off_topic_reason": "reason for going off-topic (if off_topic is true)",
  "logic_break": true/false,
  "logic_break_reason": "reason for flow disruption",
  "ambiguous_phrases": ["list of detected vague expressions"],
  "feedback_message": "feedback sentence to show the user (null if none)"
}

Rules:
- feedback_message must be concise, under 20 characters
- Be strict with off_topic judgment (true only when completely unrelated to the topic)
- If the speech closely matches the relevant script sections above, do NOT mark it off_topic
- If the speech is too short to judge, return all values as false`;

  if (personaPrompt) {
    return `${base}\n\n[Coaching Persona]\n${personaPrompt}\nApply this persona's tone and priorities when writing feedback_message.`;
  }
  return base;
};

export async function runSemanticAnalysis(
  recentText: string,
  materialSummary: string,
  offTopicLog: OffTopicEntry[],
  onResult: (payload: { offTopic?: OffTopicEntry; ambiguousDelta: number }) => void,
  personaPrompt?: string,
  sessionId?: string,
): Promise<void> {
  if (recentText.length < 50) return;

  // RAG: fetch relevant script sections for this snippet of speech
  let scriptContext: string | undefined;
  if (sessionId) {
    const chunks = await searchSimilarChunks(sessionId, recentText, 3);
    if (chunks.length > 0) {
      scriptContext = chunks
        .map((c, i) => `[${i + 1}] ${c.text}`)
        .join('\n\n');
    }
  }

  let result: SemanticResult | null = null;
  if (hasOpenAI()) {
    result = await chatJson<SemanticResult>(
      'gpt-4o-mini',
      SYSTEM(materialSummary, offTopicLog, scriptContext, personaPrompt),
      recentText
    );
  }

  if (!result) {
    const vague = (recentText.match(/roughly|something|somehow|sort of|kind of|like/gi) ?? []).length;
    result = {
      off_topic: false,
      off_topic_reason: '',
      logic_break: false,
      logic_break_reason: '',
      ambiguous_phrases: vague ? ['vague expression'] : [],
      feedback_message: vague ? 'Be more specific' : null,
    };
  }

  const ambiguousDelta = result.ambiguous_phrases?.length ?? 0;

  if (result.feedback_message) {
    const level = result.off_topic ? 'CRITICAL' : 'WARN';
    const snippet = recentText.trim().replace(/\s+/g, ' ').slice(0, 800);
    feedbackQueue.push({
      level,
      msg: result.feedback_message.slice(0, 40),
      source: 'SPEECH_SEMANTIC',
      cooldown: result.off_topic ? 60_000 : 15_000,
      speechSnippet: snippet || undefined,
    });
  }

  if (result.off_topic) {
    onResult({
      offTopic: {
        timestamp: Date.now(),
        excerpt: recentText.slice(0, 100),
        reason: result.off_topic_reason || 'off_topic',
      },
      ambiguousDelta,
    });
  } else {
    onResult({ ambiguousDelta });
  }
}
