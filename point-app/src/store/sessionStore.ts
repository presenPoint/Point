import { create } from 'zustand';
import {
  analyzeMaterial,
  gradePreQuiz,
  calcCompositeScore,
  generateReportNarrative,
  gradeQaExchanges,
  qaNextQuestion,
  feedbackQueue,
} from '../agents';
import { supabase } from '../lib/supabase';
import type { SessionContext, SessionStatus } from '../types/session';

function emptyMaterial() {
  return {
    raw_text: '',
    summary: '',
    keywords: [] as string[],
    quiz: [] as SessionContext['material']['quiz'],
    pre_quiz_score: 0,
    weak_areas: [] as string[],
  };
}

function createSession(userId: string): SessionContext {
  return {
    session_id: crypto.randomUUID(),
    user_id: userId,
    status: 'IDLE',
    started_at: new Date().toISOString(),
    material: emptyMaterial(),
    speech_coaching: {
      wpm_log: [],
      filler_count: 0,
      filler_timestamps: [],
      off_topic_log: [],
      ambiguous_count: 0,
      total_duration_sec: 0,
    },
    nonverbal_coaching: {
      gaze_rate: 0.7,
      gaze_log: [],
      posture_log: [],
      gesture_log: [],
    },
    qa: {
      exchanges: [],
      final_score: 0,
      best_answer_turn: 1,
      worst_answer_turn: 1,
    },
    report: {
      composite_score: 0,
      speech_score: 0,
      nonverbal_score: 0,
      qa_score: 0,
      strengths: [],
      improvements: [],
      generated_at: '',
    },
  };
}

type State = {
  session: SessionContext;
  preQuizAnswers: Record<number, string>;
  qaCurrentQuestion: string;
  busy: string | null;
  error: string | null;
  appStarted: boolean;
  presentationTopic: string;
  livePresentation: { wpm: number; fillerCount: number };

  setAppStarted: (v: boolean) => void;
  setPresentationTopic: (t: string) => void;
  setLivePresentation: (p: Partial<{ wpm: number; fillerCount: number }>) => void;

  resetSession: () => void;
  transition: (to: SessionStatus) => void;
  setPreQuizAnswer: (id: number, text: string) => void;
  setMaterialText: (text: string) => void;

  runMaterialAnalysis: () => Promise<void>;
  submitPreQuiz: () => Promise<void>;

  patchSpeech: (partial: Partial<SessionContext['speech_coaching']>) => void;
  patchNonverbal: (partial: Partial<SessionContext['nonverbal_coaching']>) => void;

  startQa: () => Promise<void>;
  submitQaAnswer: (answer: string) => Promise<void>;

  runReport: () => Promise<void>;
  persistSession: () => Promise<void>;
};

const DEMO_USER = '00000000-0000-0000-0000-000000000001';

let qaStartLock = false;

export const useSessionStore = create<State>((set, get) => ({
  session: createSession(DEMO_USER),
  preQuizAnswers: {},
  qaCurrentQuestion: '',
  busy: null,
  error: null,
  appStarted: false,
  presentationTopic: '',
  livePresentation: { wpm: 0, fillerCount: 0 },

  setAppStarted: (v) => set({ appStarted: v }),
  setPresentationTopic: (t) => set({ presentationTopic: t }),
  setLivePresentation: (p) =>
    set((s) => ({
      livePresentation: { ...s.livePresentation, ...p },
    })),

  resetSession: () =>
    set({
      session: createSession(DEMO_USER),
      preQuizAnswers: {},
      qaCurrentQuestion: '',
      busy: null,
      error: null,
      appStarted: false,
      presentationTopic: '',
      livePresentation: { wpm: 0, fillerCount: 0 },
    }),

  transition: (to) =>
    set((s) => ({
      session: { ...s.session, status: to },
    })),

  setPreQuizAnswer: (id, text) =>
    set((s) => ({
      preQuizAnswers: { ...s.preQuizAnswers, [id]: text },
    })),

  setMaterialText: (text) =>
    set((s) => ({
      session: {
        ...s.session,
        material: { ...s.session.material, raw_text: text },
      },
    })),

  runMaterialAnalysis: async () => {
    const raw = get().session.material.raw_text.trim();
    if (raw.length < 20) {
      set({ error: '자료를 20자 이상 입력하세요.' });
      return;
    }
    set({ busy: '자료 분석 중…', error: null });
    try {
      const result = await analyzeMaterial(raw);
      set((s) => ({
        session: {
          ...s.session,
          status: 'PRE_QUIZ',
          material: {
            ...s.session.material,
            summary: result.summary,
            keywords: result.keywords,
            quiz: result.quiz,
          },
        },
        busy: null,
      }));
    } catch (e) {
      set({ busy: null, error: String(e) });
    }
  },

  submitPreQuiz: async () => {
    const { session, preQuizAnswers } = get();
    for (const q of session.material.quiz) {
      if (!preQuizAnswers[q.id]?.trim()) {
        set({ error: '모든 퀴즈에 답하세요.' });
        return;
      }
    }
    set({ busy: '채점 중…', error: null });
    try {
      const { score, weak_areas } = await gradePreQuiz(session, preQuizAnswers);
      set((s) => ({
        session: {
          ...s.session,
          material: {
            ...s.session.material,
            pre_quiz_score: score,
            weak_areas,
          },
        },
        busy: null,
      }));
    } catch (e) {
      set({ busy: null, error: String(e) });
    }
  },

  patchSpeech: (partial) =>
    set((s) => ({
      session: {
        ...s.session,
        speech_coaching: { ...s.session.speech_coaching, ...partial },
      },
    })),

  patchNonverbal: (partial) =>
    set((s) => ({
      session: {
        ...s.session,
        nonverbal_coaching: { ...s.session.nonverbal_coaching, ...partial },
      },
    })),

  startQa: async () => {
    if (qaStartLock || get().qaCurrentQuestion) return;
    qaStartLock = true;
    set({ busy: 'Q&A 준비…', error: null });
    try {
      const q = await qaNextQuestion(get().session, []);
      set({ qaCurrentQuestion: q.text, busy: null });
    } catch (e) {
      set({ busy: null, error: String(e) });
    } finally {
      qaStartLock = false;
    }
  },

  submitQaAnswer: async (answer) => {
    const { session, qaCurrentQuestion } = get();
    const turn = session.qa.exchanges.length + 1;
    const nextExchanges = [
      ...session.qa.exchanges,
      { turn, question: qaCurrentQuestion, answer },
    ];

    set((s) => ({
      session: { ...s.session, qa: { ...s.session.qa, exchanges: nextExchanges } },
    }));

    if (nextExchanges.length >= 5) {
      set({ busy: 'Q&A 채점 중…' });
      const grade = await gradeQaExchanges(nextExchanges);
      const g = grade ?? {
        final_score: 0,
        best_answer_turn: 1,
        worst_answer_turn: 1,
      };
      set((s) => ({
        session: {
          ...s.session,
          qa: {
            ...s.session.qa,
            exchanges: nextExchanges,
            final_score: g.final_score,
            best_answer_turn: g.best_answer_turn,
            worst_answer_turn: g.worst_answer_turn,
          },
        },
        qaCurrentQuestion: '',
        busy: null,
      }));
      await get().runReport();
      return;
    }

    set({ busy: '다음 질문 생성 중…' });
    const q = await qaNextQuestion(get().session, nextExchanges);
    set({
      qaCurrentQuestion: q.text,
      busy: null,
    });
  },

  runReport: async () => {
    set((s) => ({
      session: { ...s.session, status: 'REPORT' },
      busy: '리포트 생성 중…',
    }));
    const ctx = get().session;
    const scores = calcCompositeScore(ctx);
    const narrative = await generateReportNarrative(ctx, scores);
    const generated_at = new Date().toISOString();
    set((s) => ({
      session: {
        ...s.session,
        report: {
          composite_score: scores.compositeScore,
          speech_score: scores.speechScore,
          nonverbal_score: scores.nonverbalScore,
          qa_score: scores.qaScore,
          strengths: narrative.strengths,
          improvements: narrative.improvements,
          generated_at,
        },
        status: 'DONE',
      },
      busy: null,
    }));
    feedbackQueue.clearQueue();
    await get().persistSession();
  },

  persistSession: async () => {
    const ctx = get().session;
    if (!supabase) return;
    try {
      await supabase.from('sessions').upsert({
        session_id: ctx.session_id,
        user_id: ctx.user_id,
        started_at: ctx.started_at,
        ended_at: new Date().toISOString(),
        total_duration_sec: ctx.speech_coaching.total_duration_sec,
        composite_score: ctx.report.composite_score,
        status: ctx.status,
      });
      await supabase.from('reports').insert({
        session_id: ctx.session_id,
        speech_score: ctx.report.speech_score,
        nonverbal_score: ctx.report.nonverbal_score,
        qa_score: ctx.report.qa_score,
        composite_score: ctx.report.composite_score,
        strengths: ctx.report.strengths,
        improvements: ctx.report.improvements,
        generated_at: ctx.report.generated_at,
      });
    } catch (e) {
      console.warn('Supabase 저장 생략 또는 실패', e);
    }
  },
}));
