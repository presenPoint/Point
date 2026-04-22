/**
 * Agent 4 — Post-Presentation Q&A. Spec: ./AGENT.md
 */
import { chatJson, hasOpenAI } from '../../lib/openai';
import type { QaExchange, SessionContext } from '../../types/session';
import { buildPresentationTopicBlock } from '../../lib/presentationTopicContext';

type QaGrade = {
  final_score: number;
  per_turn: Array<{ turn: number; score: number; comment: string }>;
  best_answer_turn: number;
  worst_answer_turn: number;
  overall_comment: string;
};

export function parseGptResponse(text: string): { message: string; isComplete: boolean } {
  const isComplete = text.includes('[QA_COMPLETE]');
  return {
    message: text.replace('[QA_COMPLETE]', '').trim(),
    isComplete,
  };
}

function buildSystemPrompt(ctx: SessionContext, currentTurn: number): string {
  const total = ctx.qa.planned_rounds ?? 5;
  const off = ctx.speech_coaching.off_topic_log.map((e) => e.excerpt).join(' / ');

  const scriptBlock = ctx.material.script_text?.trim()
    ? `\n[Presenter's Script — key sections for deep questioning]\n${ctx.material.script_text.slice(0, 3_000)}\n`
    : '';

  const styleBlock = ctx.material.script_style
    ? `\n[Script Style Analysis]\nTone: ${ctx.material.script_style.tone} · Complexity: ${ctx.material.script_style.complexity}\nKey phrases the presenter planned to use: ${ctx.material.script_style.keyPhrases.join(', ')}\n`
    : '';

  const topicBlock = buildPresentationTopicBlock(ctx);
  const topicSection = topicBlock
    ? `\n[Presenter-declared themes — use to judge relevance and expected depth]\n${topicBlock}\n`
    : '';

  return `You are a critical audience member who just listened to a presentation.
${topicSection}
[Presentation Material Summary]
${ctx.material.summary}

[Presenter's Weak Areas]
${ctx.material.weak_areas.length ? ctx.material.weak_areas.join(', ') : '(No specific weaknesses identified from the pre-quiz)'}

[Parts Where the Presenter Went Off-Topic]
${off || '(None)'}
${scriptBlock}${styleBlock}
[Rules]
- This session has exactly ${total} audience questions total (you are on turn ${currentTurn} of ${total}).
- After you output question ${total}, append the tag [QA_COMPLETE] at the very end of your message (no text after the tag).
- Early turns (roughly the first half, rounded up): basic comprehension, friendly tone.
- Middle turns (if any): probe weak areas, off-topic moments, or script phrases they may have missed — stricter.
- Final turn: the sharpest rebuttal or a deep question (e.g. biggest weakness or unstated risk of the pitch).
- Keep each question concise — two sentences or fewer
- Respond in English`;
}

const MOCK_QUESTIONS = [
  'Restate the core message of your presentation in one sentence.',
  'Come up with a question the audience would most likely ask, and answer it yourself.',
  'Explain how you addressed the topics identified as weak areas.',
  'If there were parts where you went off-topic during the presentation, how would you explain them?',
  'What do you think is the biggest limitation of this presentation?',
];

/** exchanges: contains only completed Q&A pairs. If empty, generates the first question. */
export async function qaNextQuestion(
  ctx: SessionContext,
  exchanges: QaExchange[]
): Promise<{ text: string; isComplete: boolean }> {
  const total = ctx.qa.planned_rounds ?? 5;
  const nextTurn = exchanges.length + 1;
  if (nextTurn > total) {
    return { text: '', isComplete: true };
  }

  if (!hasOpenAI()) {
    const q = MOCK_QUESTIONS[nextTurn - 1];
    return { text: q, isComplete: false };
  }

  const userMsg =
    exchanges.length === 0
      ? 'Output only the first question. There are no user answers yet.'
      : `Exchanges so far:\n${JSON.stringify(exchanges, null, 2)}\n\nAsk the next question.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0.5,
      messages: [
        { role: 'system', content: buildSystemPrompt(ctx, nextTurn) },
        { role: 'user', content: userMsg },
      ],
    }),
  });
  if (!res.ok) {
    return { text: 'Failed to generate a question. Please check your API key.', isComplete: false };
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim() ?? '';
  const { message, isComplete } = parseGptResponse(text);
  return { text: message, isComplete };
}

export async function gradeQaExchanges(exchanges: QaExchange[]): Promise<QaGrade | null> {
  const sys = `Evaluate the entire Q&A content below and respond with JSON only.

Response format:
{
  "final_score": 0~100,
  "per_turn": [
    { "turn": 1, "score": 0~100, "comment": "one-line evaluation" }
  ],
  "best_answer_turn": 1~5,
  "worst_answer_turn": 1~5,
  "overall_comment": "Overall Q&A review in 2–3 sentences"
}`;

  if (!hasOpenAI()) {
    return {
      final_score: 70,
      per_turn: exchanges.map((e) => ({
        turn: e.turn,
        score: 70,
        comment: 'Demo grading',
      })),
      best_answer_turn: 1,
      worst_answer_turn: exchanges.length || 1,
      overall_comment: 'Demo score — no OpenAI key provided.',
    };
  }

  return chatJson<QaGrade>(
    'gpt-4o-mini',
    sys,
    JSON.stringify(exchanges, null, 2)
  );
}
