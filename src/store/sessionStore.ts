import { create } from 'zustand';
import {
  analyzeMaterial,
  gradePreQuiz,
  buildFallbackNarrative,
  calcCompositeScore,
  enrichPhraseRewritesIfMissing,
  generateReportNarrative,
  gradeQaExchanges,
  qaNextQuestion,
  feedbackQueue,
} from '../agents';
import { supabase } from '../lib/supabase';
import { PERSONAS } from '../constants/personas';
import { chunkScript } from '../lib/scriptChunker';
import {
  embedAndStoreChunks,
  analyzeScriptStyle,
  clearChunks,
  calcScriptCoverage,
} from '../lib/scriptEmbedding';
import type { SessionContext, SessionStatus, QaDifficultyLevel, PersonaStyleCoaching, TranscriptEntry, ActionableFeedback } from '../types/session';
import { buildPresentationTopicBlock } from '../lib/presentationTopicContext';
import { resolveLocaleForCurrentApp } from './localeStore';
import { getDefaultPaceRange, getPersonaPaceRange } from '../lib/speechRate';

function emptyMaterial(): SessionContext['material'] {
  return {
    raw_text: '',
    summary: '',
    keywords: [],
    quiz: [],
    pre_quiz_score: 0,
    pre_quiz_grades: [],
    weak_areas: [],
    script_text: '',
    script_embedding_status: 'idle',
    script_chunk_count: 0,
    script_style: undefined,
    script_coverage: undefined,
  };
}

/** 발표 후 Q&A 질문 개수: 매 세션 3~5 중 무작위 */
function pickQaPlannedRounds(): number {
  return 3 + Math.floor(Math.random() * 3);
}

function createSession(userId: string): SessionContext {
  return {
    session_id: crypto.randomUUID(),
    user_id: userId,
    status: 'IDLE',
    started_at: new Date().toISOString(),
    max_duration_sec: null,
    presentation_topic_keys: [],
    presentation_topic_custom: '',
    material: emptyMaterial(),
    speech_coaching: {
      wpm_log: [],
      filler_count: 0,
      filler_timestamps: [],
      off_topic_log: [],
      ambiguous_count: 0,
      total_duration_sec: 0,
      transcript_log: [],
      volume_samples: [],
      word_emphasis_log: [],
    },
    nonverbal_coaching: {
      gaze_rate: 0.7,
      gaze_log: [],
      posture_log: [],
      gesture_log: [],
      dynamism_log: [],
    },
    qa_skipped: false,
    qa: {
      exchanges: [],
      planned_rounds: pickQaPlannedRounds(),
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

export type PersonaType =
  | 'visionary'
  | 'orator'
  | 'connector';

type State = {
  session: SessionContext;
  preQuizAnswers: Record<number, string>;
  qaCurrentQuestion: string;
  busy: import('../locales/messages').MessageKey | null;
  /** i18n key (prepare.* / qa.*) or raw error string */
  error: string | null;
  appStarted: boolean;
  /** When true with `selectedPersona === null`, skip the style survey and use default coaching/scoring. */
  skipPersonaSurvey: boolean;
  livePresentation: { wpm: number; fillerCount: number; volumeRms: number; interimText: string; recognitionError: string };
  selectedPersona: PersonaType | null;
  /** Audience Q&A — 질문 난이도(프롬프트) */
  qaDifficulty: QaDifficultyLevel;

  setAppStarted: (v: boolean) => void;
  startPersonaStyleQuiz: () => void;
  startWithDefaultCoaching: () => void;
  setPresentationTopics: (keys: string[], custom: string) => void;
  setLivePresentation: (p: Partial<{ wpm: number; fillerCount: number; volumeRms: number; interimText: string; recognitionError: string }>) => void;
  setPersona: (persona: PersonaType | null) => void;
  setQaDifficulty: (d: QaDifficultyLevel) => void;

  resetSession: () => void;
  /** 발표 자료 준비 마법사 진입 시 이전 자료·퀴즈 초기화 */
  beginMaterialPrepare: () => void;
  transition: (to: SessionStatus) => void;
  /** 발표 시작 — plan에 맞는 max_duration_sec 박제 후 PRESENTING으로 전환. */
  startPresenting: () => Promise<void>;
  /** 발표 종료 사유 기록. */
  setEndedReason: (reason: 'user' | 'time_limit' | 'abandoned' | 'error') => void;
  setPreQuizAnswer: (id: number, text: string) => void;
  setMaterialText: (text: string) => void;
  setScriptText: (text: string) => void;
  embedScript: () => Promise<void>;

  runMaterialAnalysis: () => Promise<void>;
  submitPreQuiz: () => Promise<void>;

  patchSpeech: (partial: Partial<SessionContext['speech_coaching']>) => void;
  patchNonverbal: (partial: Partial<SessionContext['nonverbal_coaching']>) => void;

  startQa: () => Promise<void>;
  submitQaAnswer: (answer: string) => Promise<void>;
  /** Q&A 없이 바로 최종 보고서 생성 */
  skipQaAndRunReport: () => Promise<void>;

  runReport: () => Promise<void>;
  /** 기존 점수는 유지하고 narrative(텍스트)만 현재 언어로 다시 생성 */
  regenerateReportNarrative: () => Promise<void>;
  persistSession: () => Promise<void>;
  setUserId: (id: string) => void;
};

export type { QaDifficultyLevel } from '../types/session';

const DEMO_USER = '00000000-0000-0000-0000-000000000001';

let qaStartLock = false;

export const useSessionStore = create<State>((set, get) => ({
  session: createSession(DEMO_USER),
  preQuizAnswers: {},
  qaCurrentQuestion: '',
  busy: null,
  error: null,
  appStarted: false,
  skipPersonaSurvey: false,
  livePresentation: { wpm: 0, fillerCount: 0, volumeRms: 0, interimText: '', recognitionError: '' },
  selectedPersona: null,
  qaDifficulty: 'standard',

  setAppStarted: (v) =>
    set({
      appStarted: v,
      ...(v === false ? { skipPersonaSurvey: false } : {}),
    }),
  startPersonaStyleQuiz: () =>
    set({
      appStarted: true,
      selectedPersona: null,
      skipPersonaSurvey: false,
    }),
  startWithDefaultCoaching: () =>
    set({
      appStarted: true,
      selectedPersona: null,
      skipPersonaSurvey: true,
    }),
  setPresentationTopics: (keys, custom) =>
    set((s) => ({
      session: {
        ...s.session,
        presentation_topic_keys: keys,
        presentation_topic_custom: custom,
      },
    })),
  setPersona: (persona) => set({ selectedPersona: persona }),
  setQaDifficulty: (d) => set({ qaDifficulty: d }),
  setLivePresentation: (p) =>
    set((s) => ({
      livePresentation: { ...s.livePresentation, ...p },
    })),

  resetSession: () => {
    const sid = get().session.session_id;
    clearChunks(sid);
    set({
      session: createSession(DEMO_USER),
      preQuizAnswers: {},
      qaCurrentQuestion: '',
      busy: null,
      error: null,
      appStarted: false,
      skipPersonaSurvey: false,
      livePresentation: { wpm: 0, fillerCount: 0, volumeRms: 0, interimText: '', recognitionError: '' },
      selectedPersona: null,
      qaDifficulty: 'standard',
    });
  },

  beginMaterialPrepare: () => {
    const sid = get().session.session_id;
    clearChunks(sid);
    set((s) => ({
      session: {
        ...s.session,
        session_id: crypto.randomUUID(),
        status: 'IDLE',
        material: emptyMaterial(),
      },
      preQuizAnswers: {},
      error: null,
      busy: null,
    }));
  },

  transition: (to) =>
    set((s) => ({
      session: { ...s.session, status: to },
    })),

  startPresenting: async () => {
    /* Edge Function이 배포돼있으면 서버 권위적 max_duration_sec 사용,
       아니면 클라이언트 billing store에서 폴백. */
    let maxSec: number | null = null;
    let serverStartedAt = new Date().toISOString();
    try {
      const { startServerSession } = await import('../lib/billing');
      const res = await startServerSession();
      if (res) {
        maxSec = res.max_duration_sec;
        serverStartedAt = res.server_started_at;
      } else {
        const { useBillingStore } = await import('./billingStore');
        const { maxDurationSecFor } = await import('../types/billing');
        maxSec = maxDurationSecFor(useBillingStore.getState().subscription);
      }
    } catch {
      maxSec = 5 * 60;
    }
    set((s) => ({
      session: {
        ...s.session,
        status: 'PRESENTING',
        started_at: serverStartedAt,
        max_duration_sec: maxSec,
        ended_reason: undefined,
      },
    }));
  },

  setEndedReason: (reason) =>
    set((s) => ({
      session: { ...s.session, ended_reason: reason },
    })),

  setPreQuizAnswer: (id, text) =>
    set((s) => {
      const next = { ...s.preQuizAnswers, [id]: text };
      if (s.session.material.pre_quiz_grades.length === 0) {
        return { preQuizAnswers: next };
      }
      return {
        preQuizAnswers: next,
        session: {
          ...s.session,
          material: {
            ...s.session.material,
            pre_quiz_score: 0,
            pre_quiz_grades: [],
            weak_areas: [],
          },
        },
      };
    }),

  setMaterialText: (text) =>
    set((s) => ({
      session: {
        ...s.session,
        material: { ...s.session.material, raw_text: text },
      },
    })),

  setScriptText: (text) =>
    set((s) => ({
      session: {
        ...s.session,
        material: {
          ...s.session.material,
          script_text: text,
          // Reset embedding state when script changes
          script_embedding_status: text.trim().length > 0 ? 'idle' : 'idle',
          script_chunk_count: 0,
          script_style: undefined,
          script_coverage: undefined,
        },
      },
    })),

  embedScript: async () => {
    const { session } = get();
    const text = session.material.script_text.trim();
    if (text.length < 20) return;

    // Mark as processing
    set((s) => ({
      session: {
        ...s.session,
        material: { ...s.session.material, script_embedding_status: 'processing' },
      },
    }));

    try {
      const chunks = chunkScript(text);
      const { stored, error } = await embedAndStoreChunks(
        session.session_id,
        session.user_id,
        chunks,
      );

      // Style analysis (non-blocking — run in parallel)
      const stylePromise = analyzeScriptStyle(text);

      if (error) {
        console.warn('Embedding partial failure:', error);
      }

      const style = await stylePromise;

      set((s) => ({
        session: {
          ...s.session,
          material: {
            ...s.session.material,
            script_embedding_status: stored > 0 ? 'ready' : 'error',
            script_chunk_count: stored,
            script_style: style ?? undefined,
          },
        },
      }));
    } catch (err) {
      console.error('embedScript failed', err);
      set((s) => ({
        session: {
          ...s.session,
          material: {
            ...s.session.material,
            script_embedding_status: 'error',
          },
        },
      }));
    }
  },

  runMaterialAnalysis: async () => {
    const raw = get().session.material.raw_text.trim();
    if (raw.length < 20) {
      set({
        error: 'prepare.error.materialTooShort',
      });
      return;
    }
    set({ busy: 'prepare.busy.analyzing', error: null });
    try {
      const scriptText = get().session.material.script_text.trim() || undefined;
      const topicBlock = buildPresentationTopicBlock(get().session);
      const result = await analyzeMaterial(raw, scriptText, topicBlock || undefined);
      set((s) => ({
        session: {
          ...s.session,
          status: 'PRE_QUIZ',
          material: {
            ...s.session.material,
            summary: result.summary,
            keywords: result.keywords,
            quiz: result.quiz,
            pre_quiz_score: 0,
            pre_quiz_grades: [],
            weak_areas: [],
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
        set({ error: 'prepare.error.answerAllQuiz' });
        return;
      }
    }
    set({ busy: 'prepare.busy.grading', error: null });
    try {
      const graded = await gradePreQuiz(session, preQuizAnswers);
      set((s) => ({
        session: {
          ...s.session,
          material: {
            ...s.session.material,
            pre_quiz_score: graded.score,
            weak_areas: graded.weak_areas,
            pre_quiz_grades: graded.per_question,
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
    if (get().session.qa_skipped) return;
    qaStartLock = true;
    set({ busy: 'qa.busy.preparing', error: null });
    try {
      const q = await qaNextQuestion(get().session, [], { pressure: get().qaDifficulty });
      if (get().session.qa_skipped) return;
      set({ qaCurrentQuestion: q.text, busy: null });
    } catch (e) {
      if (!get().session.qa_skipped) set({ busy: null, error: String(e) });
    } finally {
      qaStartLock = false;
    }
  },

  skipQaAndRunReport: async () => {
    set((s) => ({
      session: {
        ...s.session,
        qa_skipped: true,
        qa: {
          exchanges: [],
          planned_rounds: 5,
          final_score: 0,
          best_answer_turn: 1,
          worst_answer_turn: 1,
        },
      },
      qaCurrentQuestion: '',
      error: null,
    }));
    await get().runReport();
  },

  submitQaAnswer: async (answer) => {
    if (get().session.qa_skipped) return;
    const { session, qaCurrentQuestion } = get();
    const turn = session.qa.exchanges.length + 1;
    const nextExchanges = [
      ...session.qa.exchanges,
      { turn, question: qaCurrentQuestion, answer },
    ];

    set((s) => ({
      session: { ...s.session, qa: { ...s.session.qa, exchanges: nextExchanges } },
    }));

    const planned = session.qa.planned_rounds ?? 5;
    if (nextExchanges.length >= planned) {
      set({ busy: 'qa.busy.gradingQa' });
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

    set({ busy: 'qa.busy.nextQuestion' });
    const q = await qaNextQuestion(get().session, nextExchanges, { pressure: get().qaDifficulty });
    set({
      qaCurrentQuestion: q.text,
      busy: null,
    });
  },

  runReport: async () => {
    const { flushLiveTranscriptNow } = await import('../lib/liveTranscriptFlush');
    flushLiveTranscriptNow();
    set((s) => ({
      session: { ...s.session, status: 'REPORT' },
      busy: 'qa.busy.generatingReport',
      error: null,
    }));
    const ctx = get().session;
    const persona = get().selectedPersona ? PERSONAS[get().selectedPersona!] : null;
    const locale = resolveLocaleForCurrentApp();
    const paceRange = persona
      ? getPersonaPaceRange(persona.config, locale)
      : getDefaultPaceRange(locale);

    let scoresWithContext: ReturnType<typeof calcCompositeScore>;
    try {
      scoresWithContext = calcCompositeScore(ctx, paceRange);
    } catch (e) {
      console.error('calcCompositeScore failed', e);
      const msg = e instanceof Error ? e.message : String(e);
      const generated_at = new Date().toISOString();
      set((s) => ({
        busy: null,
        error: msg,
        session: {
          ...s.session,
          status: 'DONE',
          report: {
            composite_score: 0,
            speech_score: 0,
            nonverbal_score: 0,
            qa_score: 0,
            strengths: [
              'An error occurred while calculating scores. Session data may be incomplete.',
            ],
            improvements: [
              {
                label: 'What to do next',
                situation: msg,
                stop_doing: '',
                start_doing: 'Refresh the app and try again, or start a new session if the problem persists.',
                expected_impact: '',
                time_markers: [],
              },
            ],
            generated_at,
          },
        },
      }));
      feedbackQueue.clearQueue();
      await get().persistSession();
      return;
    }

    const { compositeScore, speechScore, nonverbalScore, qaScore } = scoresWithContext;

    let scriptCoverage: number | null = null;
    if (ctx.material.script_text.trim().length > 0) {
      const fullTranscript = ctx.speech_coaching.transcript_log
        .map((e) => (typeof e.text === 'string' ? e.text : ''))
        .join(' ');
      try {
        scriptCoverage = await calcScriptCoverage(ctx.session_id, fullTranscript);
      } catch (e) {
        console.warn('Script coverage skipped', e);
      }
    }

    let narrative: Awaited<ReturnType<typeof generateReportNarrative>>;
    let reportError: string | null = null;
    try {
      narrative = await generateReportNarrative(ctx, scoresWithContext, persona, scriptCoverage, locale);
    } catch (e) {
      console.error('generateReportNarrative failed', e);
      reportError = e instanceof Error ? e.message : String(e);
      narrative = buildFallbackNarrative(ctx, scoresWithContext, persona, locale);
    }

    if (persona && narrative.persona_style_coaching) {
      narrative = {
        ...narrative,
        persona_style_coaching: await enrichPhraseRewritesIfMissing(
          narrative.persona_style_coaching,
          persona,
          ctx,
        ),
      };
    }

    const generated_at = new Date().toISOString();
    set((s) => ({
      session: {
        ...s.session,
        material: {
          ...s.session.material,
          script_coverage: scriptCoverage ?? undefined,
        },
        report: {
          composite_score: compositeScore,
          speech_score: speechScore,
          nonverbal_score: nonverbalScore,
          qa_score: qaScore,
          strengths: narrative.strengths,
          improvements: narrative.improvements,
          generated_at,
          persona_style_coaching: narrative.persona_style_coaching ?? undefined,
        },
        status: 'DONE',
      },
      busy: null,
      error: reportError,
    }));
    feedbackQueue.clearQueue();
    await get().persistSession();
  },

  regenerateReportNarrative: async () => {
    const ctx = get().session;
    if (ctx.status !== 'DONE' && ctx.status !== 'REPORT') return;
    const persona = get().selectedPersona ? PERSONAS[get().selectedPersona!] : null;
    const locale = resolveLocaleForCurrentApp();
    const paceRange = persona
      ? getPersonaPaceRange(persona.config, locale)
      : getDefaultPaceRange(locale);
    set({ busy: 'qa.busy.generatingReport', error: null });
    try {
      const scoresWithContext = calcCompositeScore(ctx, paceRange);
      let narrative: Awaited<ReturnType<typeof generateReportNarrative>>;
      try {
        narrative = await generateReportNarrative(
          ctx,
          scoresWithContext,
          persona,
          ctx.material.script_coverage ?? null,
          locale,
        );
      } catch (e) {
        console.error('regenerateReportNarrative failed', e);
        narrative = buildFallbackNarrative(ctx, scoresWithContext, persona, locale);
      }
      const generated_at = new Date().toISOString();
      set((s) => ({
        session: {
          ...s.session,
          report: {
            ...s.session.report,
            strengths: narrative.strengths,
            improvements: narrative.improvements,
            persona_style_coaching: narrative.persona_style_coaching ?? s.session.report.persona_style_coaching,
            generated_at,
          },
        },
        busy: null,
      }));
      await get().persistSession();
    } catch (e) {
      set({ busy: null, error: e instanceof Error ? e.message : String(e) });
    }
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
        speech_score: ctx.report.speech_score,
        nonverbal_score: ctx.report.nonverbal_score,
        qa_score: ctx.report.qa_score,
        strengths: ctx.report.strengths,
        improvements: ctx.report.improvements,
        persona_style_coaching: ctx.report.persona_style_coaching ?? null,
        transcript_log: ctx.speech_coaching.transcript_log,
        status: ctx.status,
      });
      set({ error: null });
    } catch (e) {
      console.warn('Supabase save skipped or failed', e);
    }
  },

  setUserId: (id: string) => {
    set((s) => ({
      session: { ...s.session, user_id: id },
    }));
  },
}));

export interface SessionHistoryItem {
  session_id: string;
  started_at: string;
  ended_at: string;
  composite_score: number;
  speech_score: number;
  nonverbal_score: number;
  qa_score: number;
  strengths: string[];
  improvements: ActionableFeedback[] | string[];
  total_duration_sec: number;
  persona_style_coaching?: PersonaStyleCoaching | null;
  transcript_log?: TranscriptEntry[] | null;
}

export async function loadSessionHistory(userId: string): Promise<SessionHistoryItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'DONE')
    .order('started_at', { ascending: false })
    .limit(20);
  if (error) {
    console.warn('Failed to load history', error);
    return [];
  }
  return (data ?? []) as SessionHistoryItem[];
}
