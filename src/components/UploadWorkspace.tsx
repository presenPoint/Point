import { useEffect, useMemo, useRef, useState } from 'react';
import { speakCoachQuestion, stopCoachQuestionSpeech } from '../lib/coachQuestionTts';
import { navigateBack } from '../lib/appNavigation';
import { primeFeedbackAudio } from '../lib/feedbackTts';
import { hasOpenAI } from '../lib/openai';
import { hasSupabase } from '../lib/supabase';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { useSessionStore } from '../store/sessionStore';
import { useEffectiveLocale } from '../hooks/useEffectiveLocale';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useToastStore } from '../store/toastStore';
import { PRE_QUIZ_PASS_SCORE } from '../types/session';
import type { SessionContext } from '../types/session';
import { FileSubmissionPanel, type FileSubmissionPanelHandle } from './FileSubmissionPanel';
import { PresentationTopicPanel } from './PresentationTopicPanel';
import { ScriptUploadPanel } from './ScriptUploadPanel';
import { AnimatedPointLogo } from './AnimatedPointLogo';
import { useT } from '../hooks/useT';
import { getMessage, isMessageKey } from '../locales/messages';
import type { MessageKey } from '../locales/messages';

function VoiceQuizInput({ value, onChange, disabled, onInteract }: {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  onInteract?: () => void;
}) {
  const t = useT();
  const { transcript, listening, transcribing, error, start, stop, reset } = useSpeechToText();
  const [useTextFallback, setUseTextFallback] = useState(false);

  const toggleMic = () => {
    onInteract?.();
    if (listening) {
      stop();
    } else {
      reset();
      void start();
    }
  };

  if (transcript && !listening && !transcribing && transcript !== value) {
    onChange(transcript);
  }

  const displayText = listening
    ? t('prepare.voice.recording')
    : transcribing
      ? t('prepare.voice.transcribing')
      : transcript || value;

  if (useTextFallback) {
    return (
      <div className="voice-quiz-input">
        <textarea
          className="qc-textarea"
          placeholder={t('prepare.voice.typePlaceholder')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => onInteract?.()}
          disabled={disabled}
        />
        <button
          type="button"
          className="btn-mic-sm"
          onClick={() => setUseTextFallback(false)}
        >
          {t('prepare.voice.switchToVoice')}
        </button>
      </div>
    );
  }

  return (
    <div className="voice-quiz-input">
      <div className="voice-quiz-display">
        {displayText ? (
          <span className={`voice-transcript-text${transcribing ? ' transcribing' : ''}`}>{displayText}</span>
        ) : (
          <span className="voice-placeholder">{t('prepare.voice.placeholder')}</span>
        )}
        {listening && <span className="voice-pulse" />}
        {transcribing && <span className="voice-spinner" />}
      </div>
      {error && (
        <div className="voice-error">
          {error}
          <button type="button" className="voice-fallback-btn" onClick={() => setUseTextFallback(true)}>
            {t('prepare.voice.switchToText')}
          </button>
        </div>
      )}
      <button
        type="button"
        className={`btn-mic-sm${listening ? ' recording' : ''}`}
        disabled={disabled || transcribing}
        onClick={toggleMic}
        aria-label={listening ? t('prepare.voice.stopRecording') : t('prepare.voice.startRecording')}
      >
        {listening ? `⏹ ${t('prepare.voice.done')}` : transcribing ? t('prepare.voice.transcribing') : `🎙 ${t('prepare.voice.answer')}`}
      </button>
    </div>
  );
}

/** 발표 준비 마법사 단계 id */
export type PrepareStepId =
  | 'material_prep'
  | 'script'
  | 'analyze'
  | 'quiz'
  | (string & {});

function analysisReady(session: SessionContext): boolean {
  return session.status === 'PRE_QUIZ' && Boolean(session.material.summary?.trim());
}

function buildPrepareSteps(session: SessionContext): PrepareStepId[] {
  const out: PrepareStepId[] = ['material_prep', 'script', 'analyze'];
  if (!analysisReady(session)) {
    return out;
  }
  if (session.material.quiz.length > 0) {
    out.push('quiz');
  }
  return out;
}

function stepLabelKey(id: PrepareStepId): MessageKey {
  if (id === 'material_prep') return 'prepare.step.material';
  if (id === 'script') return 'prepare.step.script';
  if (id === 'analyze') return 'prepare.step.analyze';
  if (id === 'quiz') return 'prepare.step.quiz';
  return 'prepare.step.generic';
}

export function UploadWorkspace() {
  const t = useT();
  const locale = useEffectiveLocale();
  const session = useSessionStore((s) => s.session);
  const busy = useSessionStore((s) => s.busy);
  const error = useSessionStore((s) => s.error);
  const preQuizAnswers = useSessionStore((s) => s.preQuizAnswers);
  const setPreQuizAnswer = useSessionStore((s) => s.setPreQuizAnswer);
  const runMaterialAnalysis = useSessionStore((s) => s.runMaterialAnalysis);
  const submitPreQuiz = useSessionStore((s) => s.submitPreQuiz);
  const startPresenting = useSessionStore((s) => s.startPresenting);
  const selectedPersona = useSessionStore((s) => s.selectedPersona);

  const steps = useMemo(() => buildPrepareSteps(session), [
    session.session_id,
    session.status,
    session.material.summary,
    session.material.quiz,
  ]);

  const [stepIndex, setStepIndex] = useState(0);
  const [visibleQuizCount, setVisibleQuizCount] = useState(1);
  const filesPanelRef = useRef<FileSubmissionPanelHandle>(null);
  const lastQuizRef = useRef<HTMLDivElement>(null);
  /** 자료 추출 중 등 — Topic & materials 단계에서 Next 비활성 */
  const [filesStepBlocked, setFilesStepBlocked] = useState(false);
  /** 같은 분석 결과로 analyze 단계 → 퀴즈 자동 이동을 한 번만 */
  const preQuizAutoJumpKey = useRef<string | null>(null);

  const quizKey = session.material.quiz.map((q) => q.id).join(',');

  useEffect(() => {
    setStepIndex(0);
    setVisibleQuizCount(1);
    preQuizAutoJumpKey.current = null;
  }, [session.session_id]);

  useEffect(() => {
    setVisibleQuizCount(1);
  }, [quizKey]);

  useEffect(() => {
    if (busy === 'prepare.busy.analyzing') preQuizAutoJumpKey.current = null;
  }, [busy]);

  useEffect(() => {
    setStepIndex((i) => Math.min(i, Math.max(0, steps.length - 1)));
  }, [steps.length]);

  /** 사전 퀴즈가 생성되면 Next 없이 퀴즈 화면으로 이동 */
  useEffect(() => {
    if (busy) return;
    if (!analysisReady(session) || session.material.quiz.length === 0) return;

    const analyzeIdx = steps.indexOf('analyze');
    if (analyzeIdx < 0 || stepIndex !== analyzeIdx) return;

    const quizIdx = steps.indexOf('quiz');
    if (quizIdx < 0 || quizIdx <= analyzeIdx) return;

    const key = `${session.session_id}:${quizKey}`;
    if (preQuizAutoJumpKey.current === key) return;

    preQuizAutoJumpKey.current = key;
    setStepIndex(quizIdx);
  }, [busy, stepIndex, steps, session.session_id, quizKey, session.status, session.material.summary]);

  useEffect(() => {
    return () => stopCoachQuestionSpeech();
  }, []);

  const currentId = steps[Math.min(stepIndex, steps.length - 1)] ?? 'material_prep';
  const totalSteps = steps.length;
  const stepHuman = Math.min(stepIndex + 1, totalSteps);

  const canStartPresenting =
    session.status === 'PRE_QUIZ' &&
    Boolean(session.material.summary?.trim()) &&
    !busy;

  const isPreQuizGrading = busy === 'prepare.busy.grading';
  const errorText =
    error && isMessageKey(error)
      ? getMessage(
          locale,
          error,
          error === 'prepare.files.error.maxFiles' || error === 'prepare.files.error.partial'
            ? { max: 20 }
            : undefined,
        )
      : error;

  const quizGraded =
    session.material.quiz.length > 0 &&
    session.material.quiz.every((q) =>
      session.material.pre_quiz_grades.some((g) => g.id === q.id),
    );

  /** 새 퀴즈 문제가 공개될 때 즉시 TTS로 읽어주기 */
  useEffect(() => {
    if (busy || isPreQuizGrading) return;
    if (currentId === 'quiz' && !quizGraded) {
      const idx = visibleQuizCount - 1;
      const q = session.material.quiz[idx];
      if (!q?.question?.trim()) {
        stopCoachQuestionSpeech();
        return undefined;
      }
      const t = window.setTimeout(() => void speakCoachQuestion(q.question, selectedPersona), 80);
      return () => {
        window.clearTimeout(t);
        stopCoachQuestionSpeech();
      };
    }
    stopCoachQuestionSpeech();
    return undefined;
  }, [currentId, visibleQuizCount, selectedPersona, busy, isPreQuizGrading, session.material.quiz, quizGraded]);

  /** 새 문제 공개 시 해당 카드로 스크롤 */
  useEffect(() => {
    if (currentId === 'quiz' && lastQuizRef.current) {
      lastQuizRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [visibleQuizCount, currentId]);

  const allQuizAnswered =
    session.material.quiz.length > 0 &&
    session.material.quiz.every((q) => Boolean(preQuizAnswers[q.id]?.trim()));

  const canGoNext = (): boolean => {
    switch (currentId) {
      case 'material_prep':
      case 'script':
        return true;
      case 'analyze':
        return analysisReady(session);
      case 'quiz':
        return false;
      default:
        return true;
    }
  };

  const goNext = () => {
    stopCoachQuestionSpeech();
    if (currentId === 'material_prep') {
      const h = filesPanelRef.current;
      if (h?.hasEntries() && !h.save()) return;
      if (h?.hasEntries()) useToastStore.getState().showToast(t('prepare.toast.saved'));
    }

    if (currentId === 'analyze' && analysisReady(session) && session.material.quiz.length === 0) {
      if (!canStartPresenting) return;
      void startPresenting();
      return;
    }

    if (!(stepIndex < steps.length - 1 && canGoNext())) return;
    setStepIndex((i) => i + 1);
  };

  const goPrev = () => {
    stopCoachQuestionSpeech();
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  };

  const renderStepBody = () => {
    switch (currentId) {
      case 'material_prep':
        return (
          <div className="upload-wizard-panel upload-wizard-panel--stack">
            <h2 className="upload-wizard-title">{t('prepare.material.title', { step: stepHuman })}</h2>
            <p className="upload-wizard-lead">{t('prepare.material.lead')}</p>
            <div className="upload-wizard-subpanel">
              <h3 className="upload-wizard-subtitle">{t('prepare.material.contextTitle')}</h3>
              <p className="upload-wizard-sublead">{t('prepare.material.contextLead')}</p>
              <PresentationTopicPanel />
            </div>
            <div className="upload-wizard-subpanel">
              <h3 className="upload-wizard-subtitle">{t('prepare.material.filesTitle')}</h3>
              <p className="upload-wizard-sublead">{t('prepare.material.filesLead')}</p>
              <FileSubmissionPanel
                ref={filesPanelRef}
                globalBusy={!!busy}
                onFilesStepBlockingChange={setFilesStepBlocked}
              />
            </div>
          </div>
        );
      case 'script':
        return (
          <div className="upload-wizard-panel">
            <h2 className="upload-wizard-title">{t('prepare.script.title', { step: stepHuman })}</h2>
            <p className="upload-wizard-lead">{t('prepare.script.lead')}</p>
            <ScriptUploadPanel />
          </div>
        );
      case 'analyze':
        return (
          <div className="upload-wizard-panel">
            <h2 className="upload-wizard-title">{t('prepare.analyze.title', { step: stepHuman })}</h2>
            <p className="upload-wizard-lead">{t('prepare.analyze.lead')}</p>
            {errorText && (
              <div className="error-box" role="alert">
                {errorText}
              </div>
            )}
            <button
              type="button"
              className="btn-primary btn-analyze"
              disabled={!!busy}
              onClick={() => void runMaterialAnalysis()}
            >
              {busy === 'prepare.busy.analyzing' ? t(busy) : t('prepare.analyze.cta')}
            </button>
            {analysisReady(session) && session.material.summary && (
              <div className="analysis-complete-card upload-wizard-analysis-card">
                <div className="analysis-badge" aria-label={t('prepare.analyze.badge')}>
                  🤖 {t('prepare.analyze.badge')}
                </div>
                <div className="analysis-detail">
                  {t('prepare.analyze.detail', {
                    keywords: session.material.keywords.length,
                    questions: session.material.quiz.length,
                    questionsSuffix:
                      locale === 'ko' ? '' : session.material.quiz.length === 1 ? '' : 's',
                  })}
                  <br />
                  {t('prepare.analyze.openai', {
                    status: t(hasOpenAI() ? 'prepare.analyze.status.connected' : 'prepare.analyze.status.demo'),
                  })}{' '}
                  ·{' '}
                  {t('prepare.analyze.supabase', {
                    status: t(
                      hasSupabase() ? 'prepare.analyze.status.configured' : 'prepare.analyze.status.local',
                    ),
                  })}
                </div>
              </div>
            )}
          </div>
        );
      case 'quiz': {
        const effectiveVisibleCount = quizGraded
          ? session.material.quiz.length
          : visibleQuizCount;
        const visibleQuizzes = session.material.quiz.slice(0, effectiveVisibleCount);
        const isLastRevealed = effectiveVisibleCount >= session.material.quiz.length;

        return (
          <div className="upload-wizard-panel upload-wizard-panel--wide">
            <h2 className="upload-wizard-title">{t('prepare.quiz.title')}</h2>
            <div className="prequiz-intro-inline">
              <div className="quiz-badge">📋 {t('prepare.quiz.badge')}</div>
              <p className="upload-wizard-sublead">{t('prepare.quiz.lead')}</p>
              <div className="coach-question-tts-row">
                <button
                  type="button"
                  className="btn-sm"
                  onClick={() => {
                    primeFeedbackAudio();
                    void speakCoachQuestion(t('prepare.quiz.introTts'), selectedPersona);
                  }}
                >
                  {t('prepare.quiz.hearIntro')}
                </button>
              </div>
            </div>

            {visibleQuizzes.map((q, idx) => {
              const isActive = idx === effectiveVisibleCount - 1;
              const gradeRow = session.material.pre_quiz_grades.find((g) => g.id === q.id);
              const passed = gradeRow != null && gradeRow.score >= PRE_QUIZ_PASS_SCORE;
              const gradedCls = gradeRow != null ? (passed ? 'qc-graded-pass' : 'qc-graded-fail') : '';
              const hasAnswer = Boolean(preQuizAnswers[q.id]?.trim());
              const isLastQuestion = idx === session.material.quiz.length - 1;

              return (
                <div
                  key={q.id}
                  ref={isActive ? lastQuizRef : undefined}
                  className={`quiz-card ${gradedCls}`.trim()}
                >
                  <div className="qc-num">
                    {t('prepare.quiz.qNum', {
                      current: String(idx + 1).padStart(2, '0'),
                      total: String(session.material.quiz.length).padStart(2, '0'),
                    })}
                  </div>
                  <div className="qc-question">{q.question}</div>
                  <div className="coach-question-tts-row">
                    <button
                      type="button"
                      className="btn-sm"
                      onClick={() => {
                        primeFeedbackAudio();
                        void speakCoachQuestion(q.question, selectedPersona);
                      }}
                    >
                      {t('prepare.quiz.hearQuestion')}
                    </button>
                  </div>
                  <VoiceQuizInput
                    value={preQuizAnswers[q.id] ?? ''}
                    onChange={(val) => setPreQuizAnswer(q.id, val)}
                    disabled={!!busy || isPreQuizGrading}
                    onInteract={stopCoachQuestionSpeech}
                  />
                  {gradeRow != null && (
                    <div className={`qc-grade ${passed ? 'qc-grade-pass' : 'qc-grade-fail'}`}>
                      <div className="qc-grade-head">
                        <strong>{passed ? t('prepare.quiz.correct') : t('prepare.quiz.incorrect')}</strong>
                        <span className="qc-grade-score">{t('prepare.quiz.points', { score: gradeRow.score })}</span>
                      </div>
                      <p className="qc-grade-feedback">{gradeRow.feedback}</p>
                    </div>
                  )}
                  {isActive && !isLastQuestion && hasAnswer && !quizGraded && (
                    <div className="qc-footer qc-footer-left">
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={!!busy}
                        onClick={() => {
                          stopCoachQuestionSpeech();
                          setVisibleQuizCount((v) => v + 1);
                        }}
                      >
                        {t('prepare.quiz.nextQuestion')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {isLastRevealed && !quizGraded && (
              <div className="qc-footer qc-footer-left">
                <button
                  type="button"
                  className="btn-submit-q"
                  disabled={!!busy || !allQuizAnswered}
                  onClick={() => {
                    stopCoachQuestionSpeech();
                    void submitPreQuiz();
                  }}
                >
                  {isPreQuizGrading ? t('prepare.busy.grading') : t('prepare.quiz.submitGrade')}
                </button>
              </div>
            )}

            {quizGraded && session.material.pre_quiz_score > 0 && (
              <div className="quiz-score quiz-score-visible quiz-score-after-grade">
                <div className="qs-label">{t('prepare.quiz.scoreLabel')}</div>
                <div className="qs-score">
                  {session.material.pre_quiz_score}
                  <span className="score-unit">{locale === 'ko' ? '점' : 'pts'}</span>
                </div>
              </div>
            )}

            {quizGraded && (
              <div className="qc-footer qc-footer-left">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!canStartPresenting}
                  onClick={() => {
                    stopCoachQuestionSpeech();
                    void startPresenting();
                  }}
                >
                  {t('prepare.startPresentation')}
                </button>
              </div>
            )}
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div id="screen-upload" className="point-screen">
      <div className="app-shell">
        <div className="topbar">
          <div className="topbar-logo">
            <AnimatedPointLogo onHomeClick={() => navigateBack()} ariaLabel="Point — Home" />
          </div>
          <div className="upload-wizard-topbar-meta" aria-live="polite">
            <span className="upload-wizard-step-pill">{t('prepare.topbar.pill')}</span>
            <span className="upload-wizard-step-count">
              {t('prepare.topbar.stepOf', { current: stepHuman, total: totalSteps })}
            </span>
            <span className="upload-wizard-step-name">{t(stepLabelKey(currentId))}</span>
          </div>
          <div className="topbar-right">
            <LanguageSwitcher className="lang-switcher--topnav" />
            <button type="button" className="btn-sm" onClick={() => navigateBack()}>
              {t('nav.back')}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!canStartPresenting}
              onClick={() => {
                stopCoachQuestionSpeech();
                void startPresenting();
              }}
            >
              {t('prepare.startPresentation')}
            </button>
          </div>
        </div>

        <div className="upload-area upload-wizard-area">
          {isPreQuizGrading && (
            <div className="quiz-grading-overlay" role="status" aria-live="polite" aria-busy="true">
              <div className="quiz-grading-card">
                <div className="quiz-grading-spinner" aria-hidden />
                <p className="quiz-grading-title">{t('prepare.quiz.gradingTitle')}</p>
                <p className="quiz-grading-sub">{t('prepare.quiz.gradingSub')}</p>
              </div>
            </div>
          )}

          <div className="upload-wizard-shell">{renderStepBody()}</div>

          <div className="upload-wizard-nav">
            <button type="button" className="btn-sm" onClick={goPrev} disabled={stepIndex <= 0 || isPreQuizGrading}>
              {t('prepare.navBack')}
            </button>
            <div className="upload-wizard-nav-spacer" />
            <div className="upload-wizard-nav-actions">
              {currentId !== 'quiz' && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={goNext}
                  disabled={
                    !canGoNext() ||
                    isPreQuizGrading ||
                    (currentId === 'material_prep' && filesStepBlocked) ||
                    (currentId === 'analyze' &&
                      analysisReady(session) &&
                      session.material.quiz.length === 0 &&
                      !canStartPresenting)
                  }
                >
                  {currentId === 'analyze' &&
                  analysisReady(session) &&
                  session.material.quiz.length === 0
                    ? t('prepare.startPresentation')
                    : t('prepare.next')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
