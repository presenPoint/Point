/**
 * Agent 1 — Material & Quiz. Spec: ./AGENT.md
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

const SYSTEM_ANALYZE = `You are a presentation coach. Analyze the presentation material below and respond with JSON only.

Response format:
{
  "summary": "3–5 sentence summary of the key content",
  "keywords": ["keyword1", "keyword2", ...],
  "quiz": [
    {
      "id": 1,
      "question": "An open-ended question to verify genuine understanding of the material",
      "key_points": ["grading criterion point 1", "grading criterion point 2"]
    }
  ]
}

Rules:
- No simple memorization questions. Must be in "explain" form
- Do not ask questions about content not in the material
- Exactly 3 quiz questions. key_points are not shown to the user`;

const SYSTEM_GRADE = `Evaluate the user's answers based on the presentation material (summary and original excerpt) and quiz grading criteria below.
Do not give high scores for content not found in the material.
Respond with JSON only.

Response format:
{
  "total_score": 0~100,
  "per_question": [
    { "id": 1, "score": 0~100, "feedback": "one-line feedback" }
  ],
  "weak_areas": ["weak topic or concept 1", "weak topic or concept 2"]
}`;

function mockAnalyze(raw: string): AnalyzeResponse {
  return {
    summary: `This is a demo summary for material of ${raw.length} characters. In the actual service, GPT generates this.`,
    keywords: ['presentation', 'structure', 'key message'],
    quiz: [
      {
        id: 1,
        question: 'Explain the core purpose of this material in one sentence.',
        key_points: ['clarity of purpose'],
      },
      {
        id: 2,
        question: 'Identify the part most likely to be misunderstood by the audience and explain why.',
        key_points: ['misunderstanding point'],
      },
      {
        id: 3,
        question: 'Summarize and explain the logical flow (introduction-body-conclusion) of the material.',
        key_points: ['structural understanding'],
      },
    ],
  };
}

function mockGrade(): GradeResponse {
  return {
    total_score: 72,
    per_question: [
      { id: 1, score: 75, feedback: 'The purpose is generally clear.' },
      { id: 2, score: 68, feedback: 'The misunderstanding point could be more specific.' },
      { id: 3, score: 73, feedback: 'The flow explanation is adequate.' },
    ],
    weak_areas: ['providing evidence', 'time management'],
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
      question: 'Explain the core argument of the material.',
      key_points: ['comprehension'],
    });
  }
  parsed.quiz = parsed.quiz.slice(0, 3);
  return parsed;
}

export type GradePreQuizResult = {
  score: number;
  weak_areas: string[];
  per_question: Array<{ id: number; score: number; feedback: string }>;
};

export async function gradePreQuiz(
  ctx: Pick<SessionContext, 'material'>,
  answers: Record<number, string>
): Promise<GradePreQuizResult> {
  const payload = {
    material_summary: ctx.material.summary,
    material_excerpt: ctx.material.raw_text.slice(0, 24_000),
    quiz: ctx.material.quiz.map((q) => ({
      id: q.id,
      question: q.question,
      key_points: q.key_points,
      user_answer: answers[q.id] ?? '',
    })),
  };

  if (!hasOpenAI()) {
    const m = mockGrade();
    return {
      score: m.total_score,
      weak_areas: m.weak_areas,
      per_question: m.per_question,
    };
  }

  const g = await chatJson<GradeResponse>(
    'gpt-4o-mini',
    SYSTEM_GRADE,
    JSON.stringify(payload, null, 2)
  );
  if (!g) {
    const m = mockGrade();
    return {
      score: m.total_score,
      weak_areas: m.weak_areas,
      per_question: m.per_question,
    };
  }
  const pq = g.per_question ?? [];
  const per_question =
    pq.length === ctx.material.quiz.length
      ? pq
      : ctx.material.quiz.map((q, i) => ({
          id: q.id,
          score: Math.round(g.total_score / Math.max(ctx.material.quiz.length, 1)),
          feedback:
            pq.find((p) => p.id === q.id)?.feedback ??
            pq[i]?.feedback ??
            'Could not generate feedback.',
        }));
  return {
    score: g.total_score,
    weak_areas: g.weak_areas ?? [],
    per_question,
  };
}
