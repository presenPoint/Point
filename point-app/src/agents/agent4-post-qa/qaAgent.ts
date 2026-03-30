/**
 * Agent 4 — Post-Presentation Q&A. 규격: ./AGENT.md
 */
import { chatJson, hasOpenAI } from '../../lib/openai';
import type { QaExchange, SessionContext } from '../../types/session';

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
  const off = ctx.speech_coaching.off_topic_log.map((e) => e.excerpt).join(' / ');
  return `너는 방금 발표를 들은 비판적인 청중이다.

[발표 자료 요약]
${ctx.material.summary}

[발표자가 취약한 영역]
${ctx.material.weak_areas.join(', ')}

[발표 중 주제를 이탈한 부분]
${off || '(없음)'}

[규칙]
- 총 5회 질문 후 반드시 종료한다
- 현재 진행 중인 턴: ${currentTurn} / 5
- 1~2회: 기본 이해 확인 질문 (친절한 톤)
- 3~4회: 취약 영역 집중 질문 (엄격한 톤)
- 5회: 가장 날카로운 반박 또는 '이 발표의 가장 큰 약점이 무엇이라고 생각하나요?' 형태의 심화 질문
- 5회 완료 시 응답 마지막에 [QA_COMPLETE] 태그를 붙여라
- 질문은 두 문장 이내로 간결하게
- 한국어로 응답해라`;
}

const MOCK_QUESTIONS = [
  '발표의 핵심 메시지를 한 문장으로 다시 말해보시오.',
  '청중이 가장 궁금해할 질문 하나를 스스로 정해 답하시오.',
  '취약 영역으로 지적된 주제를 어떻게 보완했는지 설명하시오.',
  '발표 중 주제에서 벗어난 부분이 있었다면 어떻게 설명하시겠습니까?',
  '이 발표의 가장 큰 한계는 무엇이라고 생각하시나요?',
];

/** exchanges: 이미 완료된 질문·답변만 포함. 비어 있으면 첫 질문 생성. */
export async function qaNextQuestion(
  ctx: SessionContext,
  exchanges: QaExchange[]
): Promise<{ text: string; isComplete: boolean }> {
  const nextTurn = exchanges.length + 1;
  if (nextTurn > 5) {
    return { text: '', isComplete: true };
  }

  if (!hasOpenAI()) {
    const q = MOCK_QUESTIONS[nextTurn - 1];
    return { text: q, isComplete: false };
  }

  const userMsg =
    exchanges.length === 0
      ? '첫 번째 질문만 출력해줘. 아직 사용자 답변은 없다.'
      : `지금까지 교환:\n${JSON.stringify(exchanges, null, 2)}\n\n다음 질문을 해줘.`;

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
    return { text: '질문 생성에 실패했습니다. API 키를 확인하세요.', isComplete: false };
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim() ?? '';
  const { message, isComplete } = parseGptResponse(text);
  return { text: message, isComplete };
}

export async function gradeQaExchanges(exchanges: QaExchange[]): Promise<QaGrade | null> {
  const sys = `아래 Q&A 전체 내용을 평가해서 JSON으로만 응답해라.

응답 형식:
{
  "final_score": 0~100,
  "per_turn": [
    { "turn": 1, "score": 0~100, "comment": "한 줄 평가" }
  ],
  "best_answer_turn": 1~5,
  "worst_answer_turn": 1~5,
  "overall_comment": "전체 Q&A 총평 2~3문장"
}`;

  if (!hasOpenAI()) {
    return {
      final_score: 70,
      per_turn: exchanges.map((e) => ({
        turn: e.turn,
        score: 70,
        comment: '데모 채점',
      })),
      best_answer_turn: 1,
      worst_answer_turn: exchanges.length || 1,
      overall_comment: 'OpenAI 키가 없어 데모 점수입니다.',
    };
  }

  return chatJson<QaGrade>(
    'gpt-4o-mini',
    sys,
    JSON.stringify(exchanges, null, 2)
  );
}
