/**
 * Agent 4 — Post-Presentation Q&A. Spec: ./AGENT.md
 */
import { chatCompletionText, chatJson, hasOpenAI } from '../../lib/openai';
import type { QaDifficultyLevel, QaExchange, SessionContext } from '../../types/session';
import { buildPresentationTopicBlock } from '../../lib/presentationTopicContext';
import { resolveLocaleForCurrentApp, type AppLocale } from '../../store/localeStore';
import { aiOutputLanguageRule, sanitizeKoUserFacingDeep } from '../../lib/aiOutputLocale';

type QaGrade = {
  final_score: number;
  per_turn: Array<{ turn: number; score: number; comment: string }>;
  best_answer_turn: number;
  worst_answer_turn: number;
  overall_comment: string;
};

export function parseGptResponse(text: string): { message: string; isComplete: boolean; isFollowUp: boolean } {
  const isComplete = text.includes('[QA_COMPLETE]');
  const isFollowUp = text.includes('[QA_FOLLOWUP]');
  return {
    message: text.replace('[QA_COMPLETE]', '').replace('[QA_FOLLOWUP]', '').trim(),
    isComplete,
    isFollowUp,
  };
}

function pressureBlock(level: QaDifficultyLevel): string {
  switch (level) {
    case 'firm':
      return `\n[Audience pressure: FIRM]\n- Ask one notch harder than a friendly panel: demand specifics, trade-offs, or one-line proof.\n- Still professional — no insults or theatrics.\n`;
    case 'intense':
      return `\n[Audience pressure: INTENSE]\n- Simulate skeptical investors or a sharp press line: short questions, zero small talk, insist on evidence and risks.\n- Final turn must feel like a real stress test.\n`;
    default:
      return `\n[Audience pressure: STANDARD]\n- Follow the early/middle/final arc below with the default tone mix.\n`;
  }
}

function buildSystemPrompt(
  ctx: SessionContext,
  mainTurn: number,
  pressure: QaDifficultyLevel,
  followUpAllowed: boolean,
  locale: AppLocale = 'en',
): string {
  const total = ctx.qa.planned_rounds ?? 5;
  const off = ctx.speech_coaching.off_topic_log
    .map((e) => (typeof e.excerpt === 'string' ? e.excerpt : ''))
    .filter(Boolean)
    .join(' / ');

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

  const followUpBlock = followUpAllowed
    ? `\n[Follow-up Rule]\nReview the presenter's LAST answer. If it was vague, incomplete, or missed a key point:\n- Ask ONE focused follow-up on the same topic (one sentence).\n- Append [QA_FOLLOWUP] at the very end of your message (no other text after the tag).\n- Follow-ups do NOT count toward the ${total}-question total.\nIf the answer was sufficient, proceed to main question ${mainTurn} (no tag needed).\n`
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
- This session has exactly ${total} main audience questions total (you are on main question ${mainTurn} of ${total}).
- After you output main question ${total} (and it has no follow-up), append the tag [QA_COMPLETE] at the very end of your message (no text after the tag).
- Early turns (roughly the first half, rounded up): basic comprehension, friendly tone.
- Middle turns (if any): probe weak areas, off-topic moments, or script phrases they may have missed — stricter.
- Final turn: the sharpest rebuttal or a deep question (e.g. biggest weakness or unstated risk of the pitch).
- Keep each question concise — two sentences or fewer
${aiOutputLanguageRule(locale)}
${followUpBlock}${pressureBlock(pressure)}`;
}

const MOCK_QUESTIONS = [
  'Restate the core message of your presentation in one sentence.',
  'Come up with a question the audience would most likely ask, and answer it yourself.',
  'Explain how you addressed the topics identified as weak areas.',
  'If there were parts where you went off-topic during the presentation, how would you explain them?',
  'What do you think is the biggest limitation of this presentation?',
];

export type QaNextQuestionOpts = {
  pressure?: QaDifficultyLevel;
  /** When true, the AI may ask a follow-up on the last answer instead of advancing to the next main question */
  followUpAllowed?: boolean;
};

/** exchanges: contains only completed Q&A pairs (including any follow-ups). If empty, generates the first question. */
export async function qaNextQuestion(
  ctx: SessionContext,
  exchanges: QaExchange[],
  opts?: QaNextQuestionOpts,
): Promise<{ text: string; isComplete: boolean; isFollowUp: boolean }> {
  const pressure = opts?.pressure ?? 'standard';
  const followUpAllowed = opts?.followUpAllowed ?? false;
  const locale = resolveLocaleForCurrentApp();
  const total = ctx.qa.planned_rounds ?? 5;

  const mainExchanges = exchanges.filter((e) => !e.is_followup);
  const nextMainTurn = mainExchanges.length + 1;

  // No more main questions and no follow-up to consider
  if (nextMainTurn > total && !followUpAllowed) {
    return { text: '', isComplete: true, isFollowUp: false };
  }

  if (!hasOpenAI()) {
    // In mock mode, never generate follow-ups
    if (nextMainTurn > total) return { text: '', isComplete: true, isFollowUp: false };
    const q = MOCK_QUESTIONS[(nextMainTurn - 1) % MOCK_QUESTIONS.length];
    return { text: q, isComplete: false, isFollowUp: false };
  }

  const userMsg =
    exchanges.length === 0
      ? 'Output only the first question. There are no user answers yet.'
      : `Exchanges so far:\n${JSON.stringify(exchanges, null, 2)}\n\nAsk the next question.`;

  const temperature =
    pressure === 'intense' ? 0.38 : pressure === 'firm' ? 0.45 : 0.5;

  let text: string | null;
  try {
    text = await chatCompletionText(
      'gpt-4o',
      buildSystemPrompt(ctx, nextMainTurn, pressure, followUpAllowed, locale),
      userMsg,
      temperature,
    );
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { text: `Failed to generate a question: ${detail}`, isComplete: false, isFollowUp: false };
  }
  if (!text) {
    return { text: 'Failed to generate a question. Please check your API key or server OpenAI proxy.', isComplete: false, isFollowUp: false };
  }
  const { message, isComplete, isFollowUp } = parseGptResponse(text);
  return { text: message, isComplete, isFollowUp };
}

export async function gradeQaExchanges(exchanges: QaExchange[]): Promise<QaGrade | null> {
  const locale = resolveLocaleForCurrentApp();
  const sys = `Evaluate the entire Q&A content below and respond with JSON only.
Some exchanges may have "is_followup": true — these are clarifying follow-up questions on the same main question. When scoring, group follow-ups with their main question: use the final answer in the exchange pair as the main score. Turn numbers in per_turn must refer to main question numbers only (ignore follow-up turn numbers).

Response format:
{
  "final_score": 0~100,
  "per_turn": [
    { "turn": 1, "score": 0~100, "comment": "one-line evaluation" }
  ],
  "best_answer_turn": 1~5,
  "worst_answer_turn": 1~5,
  "overall_comment": "Overall Q&A review in 2–3 sentences"
}
${aiOutputLanguageRule(locale)}`;

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

  const result = await chatJson<QaGrade>(
    'gpt-4o-mini',
    sys,
    JSON.stringify(exchanges, null, 2)
  );
  return result ? sanitizeKoUserFacingDeep(result, locale) : null;
}
