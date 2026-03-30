/**
 * Agent 1 — Material & Quiz. 역할·I/O 규격: ./AGENT.md
 */
import { chatJson, hasOpenAI } from '../../lib/openai';
import type { QuizItem, SessionContext } from '../../types/session';

type AnalyzeResponse = {
  summary: string;
  keywords: string[];
  quiz: QuizItem[];
};

type GradeResponse = {
  total_score: number;
  per_question: Array<{ id: number; score: number; feedback: string }>;
  weak_areas: string[];
};

const SYSTEM_ANALYZE = `너는 발표 코치다. 아래 발표 자료를 분석해서 JSON으로만 응답해라.

응답 형식:
{
  "summary": "핵심 내용 3~5문장 요약",
  "keywords": ["키워드1", "키워드2", ...],
  "quiz": [
    {
      "id": 1,
      "question": "이 자료를 실제로 이해했는지 확인하는 서술형 질문",
      "key_points": ["채점 기준 포인트1", "채점 기준 포인트2"]
    }
  ]
}

규칙:
- 단순 암기형 질문 금지. 반드시 '설명하시오' 형태
- 자료에 없는 내용으로 질문하지 마라
- quiz는 정확히 3문항. key_points는 사용자에게 보이지 않는다`;

const SYSTEM_GRADE = `아래 발표 자료와 퀴즈 채점 기준을 바탕으로 사용자 답변을 평가해라.
JSON으로만 응답해라.

응답 형식:
{
  "total_score": 0~100,
  "per_question": [
    { "id": 1, "score": 0~100, "feedback": "한 줄 피드백" }
  ],
  "weak_areas": ["취약한 주제나 개념 1", "취약한 주제나 개념 2"]
}`;

function mockAnalyze(raw: string): AnalyzeResponse {
  return {
    summary: `자료 길이 ${raw.length}자에 대한 데모 요약입니다. 실제 서비스에서는 GPT가 생성합니다.`,
    keywords: ['발표', '구조', '핵심메시지'],
    quiz: [
      {
        id: 1,
        question: '이 자료의 핵심 목적을 한 문장으로 설명하시오.',
        key_points: ['목적 명확성'],
      },
      {
        id: 2,
        question: '청중이 가장 오해하기 쉬운 부분을 짚고, 왜 그런지 설명하시오.',
        key_points: ['오해 포인트'],
      },
      {
        id: 3,
        question: '자료의 논리적 흐름(도입-전개-결론)을 요약해 설명하시오.',
        key_points: ['구조 이해'],
      },
    ],
  };
}

function mockGrade(): GradeResponse {
  return {
    total_score: 72,
    per_question: [
      { id: 1, score: 75, feedback: '목적이 대체로 분명합니다.' },
      { id: 2, score: 68, feedback: '오해 포인트를 더 구체화하면 좋습니다.' },
      { id: 3, score: 73, feedback: '흐름 설명이 무난합니다.' },
    ],
    weak_areas: ['근거 제시', '시간 배분'],
  };
}

export async function analyzeMaterial(rawText: string): Promise<AnalyzeResponse> {
  if (!hasOpenAI()) return mockAnalyze(rawText);
  const parsed = await chatJson<AnalyzeResponse>(
    'gpt-4o',
    SYSTEM_ANALYZE,
    rawText.slice(0, 120_000)
  );
  if (!parsed?.quiz?.length) return mockAnalyze(rawText);
  while (parsed.quiz.length < 3) {
    parsed.quiz.push({
      id: parsed.quiz.length + 1,
      question: '자료의 핵심 논지를 설명하시오.',
      key_points: ['이해'],
    });
  }
  parsed.quiz = parsed.quiz.slice(0, 3);
  return parsed;
}

export async function gradePreQuiz(
  ctx: Pick<SessionContext, 'material'>,
  answers: Record<number, string>
): Promise<{ score: number; weak_areas: string[] }> {
  const payload = {
    material_summary: ctx.material.summary,
    quiz: ctx.material.quiz.map((q) => ({
      id: q.id,
      question: q.question,
      key_points: q.key_points,
      user_answer: answers[q.id] ?? '',
    })),
  };

  if (!hasOpenAI()) {
    const m = mockGrade();
    return { score: m.total_score, weak_areas: m.weak_areas };
  }

  const g = await chatJson<GradeResponse>(
    'gpt-4o-mini',
    SYSTEM_GRADE,
    JSON.stringify(payload, null, 2)
  );
  if (!g) {
    const m = mockGrade();
    return { score: m.total_score, weak_areas: m.weak_areas };
  }
  return { score: g.total_score, weak_areas: g.weak_areas };
}
