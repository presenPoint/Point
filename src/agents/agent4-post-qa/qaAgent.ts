/**
 * Agent 4 — Post-Presentation Q&A. Spec: ./AGENT.md
 */
import { chatCompletionText, chatJson, hasOpenAI } from '../../lib/openai';
import type { QaDifficultyLevel, QaExchange, SessionContext } from '../../types/session';
import { buildPresentationTopicBlock } from '../../lib/presentationTopicContext';
import { transcriptPlain, transcriptWithTimestamps } from '../../lib/transcriptScript';
import type { AppLocale } from '../../store/localeStore';
import { useLocaleStore } from '../../store/localeStore';

const QA_TRANSCRIPT_MAX_CHARS = 4_500;

/** Q&A 프롬프트용 전사 발췌 (앞·뒤 유지) */
function transcriptExcerptForQa(ctx: SessionContext): string {
  const plain = transcriptPlain(
    ctx.speech_coaching.transcript_log,
    ctx.speech_coaching.transcript_live_draft,
  );
  if (!plain) return '';
  if (plain.length <= QA_TRANSCRIPT_MAX_CHARS) return plain;
  const headBudget = 1_200;
  const tailBudget = QA_TRANSCRIPT_MAX_CHARS - headBudget - 4;
  return `${plain.slice(0, headBudget)}\n…\n${plain.slice(-tailBudget)}`;
}

function buildTranscriptSection(ctx: SessionContext, locale: AppLocale): string {
  const excerpt = transcriptExcerptForQa(ctx);
  if (!excerpt) {
    return locale === 'ko'
      ? '\n[실제 발표 전사]\n(전사 없음 — 아래 자료 요약·약점·이탈 로그를 우선 사용)\n'
      : '\n[What they actually said — live transcript]\n(No transcript captured — use material summary, weak areas, and off-topic log instead.)\n';
  }

  const stamped = transcriptWithTimestamps(
    ctx.speech_coaching.transcript_log,
    ctx.started_at,
  );
  const timedTail =
    stamped.length > 2_800 ? `${stamped.slice(0, 2_800)}\n…` : stamped;

  const priority =
    locale === 'ko'
      ? '★ 질문의 1순위 근거: 아래 전사(실제로 한 말). 자료 요약과 다르면 전사를 따르세요. 전사에 없는 내용을 “말했다”고 가정하지 마세요.'
      : '★ Primary source for questions: the transcript below (what they actually said). If it conflicts with the material summary, trust the transcript. Do not assume they said something not in the transcript.';

  return `\n[What they actually said — live speech transcript]\n${priority}\n\n${excerpt}\n\n[Timed excerpt — same session]\n${timedTail || excerpt}\n`;
}

function resolveLocale(locale?: AppLocale): AppLocale {
  return locale ?? useLocaleStore.getState().locale;
}

function languageRule(locale: AppLocale): string {
  return locale === 'ko'
    ? '- 모든 질문은 자연스러운 한국어(존댓말, 청중·패널 톤)로 작성'
    : '- Respond in English';
}

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
  currentTurn: number,
  pressure: QaDifficultyLevel,
  locale: AppLocale,
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

  const transcriptSection = buildTranscriptSection(ctx, locale);
  const materialSummary = ctx.material.summary?.trim() || '(No uploaded material summary)';
  const hasTranscript = transcriptExcerptForQa(ctx).length >= 60;

  const transcriptRules = hasTranscript
    ? locale === 'ko'
      ? `- 각 질문은 전사에 나온 주장·용어·수치·논리를 최소 한 번 인용하거나 구체적으로 짚을 것 (예: "방금 ○○라고 하셨는데…").
- 전사에 거의 안 나온 주제는 "왜 다루지 않으셨나요?"처럼 누락 질문만 허용.
- 모호한 일반 질문(예: "핵심 메시지가 뭐죠?"만 반복)은 피할 것.`
      : `- Each question must anchor to something specific from the transcript (a claim, term, number, or logic gap), e.g. "You said X — how would you…".
- Only ask about topics absent from the transcript if probing a deliberate omission.
- Avoid generic questions that ignore what they actually said.`
    : locale === 'ko'
      ? '- 전사가 없으므로 자료 요약·약점·이탈 로그를 근거로 질문할 것.'
      : '- No live transcript — base questions on material summary, weak areas, and off-topic log.';

  return `You are a critical audience member who just listened to a presentation.
${transcriptSection}
${topicSection}
[Presentation Material Summary — supplemental context only]
${materialSummary}

[Presenter's Weak Areas — from pre-quiz]
${ctx.material.weak_areas.length ? ctx.material.weak_areas.join(', ') : '(No specific weaknesses identified from the pre-quiz)'}

[Parts Where the Presenter Went Off-Topic — detected during live speech]
${off || '(None)'}
${scriptBlock}${styleBlock}
[Rules]
- This session has exactly ${total} audience questions total (you are on turn ${currentTurn} of ${total}).
- After you output question ${total}, append the tag [QA_COMPLETE] at the very end of your message (no text after the tag).
- Early turns (roughly the first half, rounded up): comprehension of what they actually said in the transcript; friendly tone.
- Middle turns (if any): probe gaps, contradictions, weak areas, off-topic moments, or vague claims in the transcript — stricter.
- Final turn: the sharpest challenge tied to their actual words (biggest risk, unstated assumption, or weak proof in the transcript).
- Keep each question concise — two sentences or fewer
${transcriptRules}
${languageRule(locale)}
${pressureBlock(pressure)}`;
}

const MOCK_QUESTIONS_EN = [
  'Restate the core message of your presentation in one sentence.',
  'Come up with a question the audience would most likely ask, and answer it yourself.',
  'Explain how you addressed the topics identified as weak areas.',
  'If there were parts where you went off-topic during the presentation, how would you explain them?',
  'What do you think is the biggest limitation of this presentation?',
];

const MOCK_QUESTIONS_KO = [
  '발표의 핵심 메시지를 한 문장으로 요약해 주세요.',
  '청중이 가장 궁금해할 질문 하나를 정해 직접 답해 보세요.',
  '사전 퀴즈에서 약점으로 나온 주제들을 발표에서 어떻게 다뤘는지 설명해 주세요.',
  '발표 중 주제에서 벗어난 부분이 있었다면, 그 이유와 보완 방안을 말씀해 주세요.',
  '이 발표의 가장 큰 한계는 무엇이라고 보시나요?',
];

export type QaNextQuestionOpts = {
  pressure?: QaDifficultyLevel;
  locale?: AppLocale;
};

/** exchanges: contains only completed Q&A pairs. If empty, generates the first question. */
export async function qaNextQuestion(
  ctx: SessionContext,
  exchanges: QaExchange[],
  opts?: QaNextQuestionOpts,
): Promise<{ text: string; isComplete: boolean }> {
  const pressure = opts?.pressure ?? 'standard';
  const locale = resolveLocale(opts?.locale);
  const total = ctx.qa.planned_rounds ?? 5;
  const nextTurn = exchanges.length + 1;
  if (nextTurn > total) {
    return { text: '', isComplete: true };
  }

  if (!hasOpenAI()) {
    const pool = locale === 'ko' ? MOCK_QUESTIONS_KO : MOCK_QUESTIONS_EN;
    const q = pool[nextTurn - 1];
    return { text: q, isComplete: false };
  }

  const transcriptHint =
    transcriptExcerptForQa(ctx).length >= 60
      ? locale === 'ko'
        ? '전사에 나온 구체적 표현을 짚는 질문으로.'
        : 'Anchor the question to specific wording from the transcript.'
      : '';

  const userMsg =
    exchanges.length === 0
      ? locale === 'ko'
        ? `첫 질문만 출력하세요. 아직 사용자 답변이 없습니다. ${transcriptHint}`.trim()
        : `Output only the first question. There are no user answers yet. ${transcriptHint}`.trim()
      : locale === 'ko'
        ? `지금까지의 Q&A:\n${JSON.stringify(exchanges, null, 2)}\n\n다음 질문을 해 주세요. ${transcriptHint}`.trim()
        : `Exchanges so far:\n${JSON.stringify(exchanges, null, 2)}\n\nAsk the next question. ${transcriptHint}`.trim();

  const temperature =
    pressure === 'intense' ? 0.38 : pressure === 'firm' ? 0.45 : 0.5;

  let text: string | null;
  try {
    text = await chatCompletionText(
      'gpt-4o',
      buildSystemPrompt(ctx, nextTurn, pressure, locale),
      userMsg,
      temperature,
    );
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { text: `Failed to generate a question: ${detail}`, isComplete: false };
  }
  if (!text) {
    return { text: 'Failed to generate a question. Please check your API key or server OpenAI proxy.', isComplete: false };
  }
  const { message, isComplete } = parseGptResponse(text);
  return { text: message, isComplete };
}

export type GradeQaOpts = { locale?: AppLocale };

export async function gradeQaExchanges(
  exchanges: QaExchange[],
  opts?: GradeQaOpts,
): Promise<QaGrade | null> {
  const locale = resolveLocale(opts?.locale);
  const commentLang =
    locale === 'ko'
      ? '모든 comment와 overall_comment는 자연스러운 한국어(존댓말)로 작성'
      : 'Write all comment and overall_comment fields in English';

  const sys = `Evaluate the entire Q&A content below and respond with JSON only.
${commentLang}

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
        comment: locale === 'ko' ? '데모 채점' : 'Demo grading',
      })),
      best_answer_turn: 1,
      worst_answer_turn: exchanges.length || 1,
      overall_comment:
        locale === 'ko'
          ? '데모 점수 — OpenAI API 키가 없습니다.'
          : 'Demo score — no OpenAI key provided.',
    };
  }

  return chatJson<QaGrade>(
    'gpt-4o-mini',
    sys,
    JSON.stringify(exchanges, null, 2)
  );
}
