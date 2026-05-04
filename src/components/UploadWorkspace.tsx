import { useEffect, useMemo, useRef, useState } from 'react';
import { speakCoachQuestion, stopCoachQuestionSpeech } from '../lib/coachQuestionTts';
import { primeFeedbackAudio } from '../lib/feedbackTts';
import { hasOpenAI } from '../lib/openai';
import { hasSupabase } from '../lib/supabase';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { useSessionStore } from '../store/sessionStore';
import { useToastStore } from '../store/toastStore';
import { PRE_QUIZ_PASS_SCORE } from '../types/session';
import type { SessionContext } from '../types/session';
import { FileSubmissionPanel, type FileSubmissionPanelHandle } from './FileSubmissionPanel';
import { PresentationTopicPanel } from './PresentationTopicPanel';
import { ScriptUploadPanel } from './ScriptUploadPanel';
import { AnimatedPointLogo } from './AnimatedPointLogo';

const PRE_QUIZ_INTRO_TTS =
  'Here is your short warm-up before you present. Answer each question with your voice or by typing — confirm your answer to reveal the next one.';

function VoiceQuizInput({ value, onChange, disabled, onInteract }: {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  onInteract?: () => void;
}) {
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

  const displayText = listening ? 'Recording...' : transcribing ? 'Transcribing...' : (transcript || value);

  if (useTextFallback) {
    return (
      <div className="voice-quiz-input">
        <textarea
          className="qc-textarea"
          placeholder="Type your answer..."
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
          🎙 Switch to voice input
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
          <span className="voice-placeholder">🎙 Press mic to answer with voice</span>
        )}
        {listening && <span className="voice-pulse" />}
        {transcribing && <span className="voice-spinner" />}
      </div>
      {error && (
        <div className="voice-error">
          {error}
          <button type="button" className="voice-fallback-btn" onClick={() => setUseTextFallback(true)}>
            ⌨ Switch to text input
          </button>
        </div>
      )}
      <button
        type="button"
        className={`btn-mic-sm${listening ? ' recording' : ''}`}
        disabled={disabled || transcribing}
        onClick={toggleMic}
        aria-label={listening ? 'Stop recording' : 'Voice recording'}
      >
        {listening ? '⏹ Done' : transcribing ? 'Transcribing...' : '🎙 Answer'}
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

function stepLabel(id: PrepareStepId): string {
  if (id === 'material_prep') return 'Topic & materials';
  if (id === 'script') return 'Optional script';
  if (id === 'analyze') return 'AI analysis';
  if (id === 'quiz') return 'Pre-quiz';
  return 'Step';
}

export function UploadWorkspace() {
  const session = useSessionStore((s) => s.session);
  const busy = useSessionStore((s) => s.busy);
  const error = useSessionStore((s) => s.error);
  const preQuizAnswers = useSessionStore((s) => s.preQuizAnswers);
  const setAppStarted = useSessionStore((s) => s.setAppStarted);
  const setPreQuizAnswer = useSessionStore((s) => s.setPreQuizAnswer);
  const runMaterialAnalysis = useSessionStore((s) => s.runMaterialAnalysis);
  const submitPreQuiz = useSessionStore((s) => s.submitPreQuiz);
  const transition = useSessionStore((s) => s.transition);
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
    if (busy === 'Analyzing materials...') preQuizAutoJumpKey.current = null;
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

  const isPreQuizGrading = busy === 'Grading...';

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
      if (h?.hasEntries()) useToastStore.getState().showToast('저장 완료');
    }

    if (currentId === 'analyze' && analysisReady(session) && session.material.quiz.length === 0) {
      if (!canStartPresenting) return;
      transition('PRESENTING');
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
            <h2 className="upload-wizard-title">Step {stepHuman} — Topic &amp; materials</h2>
            <p className="upload-wizard-lead">
              Set the presentation context, then add files. Press <strong>Next</strong> to save materials and continue
              — no separate save step.
            </p>
            <div className="upload-wizard-subpanel">
              <h3 className="upload-wizard-subtitle">Presentation context</h3>
              <p className="upload-wizard-sublead">
                Tell Point what this deck is about. This shapes coaching tone and quiz focus.
              </p>
              <PresentationTopicPanel />
            </div>
            <div className="upload-wizard-subpanel">
              <h3 className="upload-wizard-subtitle">Materials</h3>
              <p className="upload-wizard-sublead">TXT, MD, PDF, or PPTX — drag in or use the toolbar.</p>
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
            <h2 className="upload-wizard-title">Step {stepHuman} — Optional script</h2>
            <p className="upload-wizard-lead">
              If you have a written script, add it for better plan-vs-actual feedback in your report. You can skip this step.
            </p>
            <ScriptUploadPanel />
          </div>
        );
      case 'analyze':
        return (
          <div className="upload-wizard-panel">
            <h2 className="upload-wizard-title">Step {stepHuman} — AI analysis &amp; quiz</h2>
            <p className="upload-wizard-lead">
              Run analysis to extract keywords and generate a short pre-presentation quiz. This usually takes a moment.
            </p>
            {error && (
              <div className="error-box" role="alert">
                {error}
              </div>
            )}
            <button
              type="button"
              className="btn-primary btn-analyze"
              disabled={!!busy}
              onClick={() => void runMaterialAnalysis()}
            >
              {busy === 'Analyzing materials...' ? busy : 'AI Analysis & Quiz Generation'}
            </button>
            {analysisReady(session) && session.material.summary && (
              <div className="analysis-complete-card upload-wizard-analysis-card">
                <div className="analysis-badge" aria-label="Analysis complete">
                  🤖 AI ANALYSIS COMPLETE
                </div>
                <div className="analysis-detail">
                  <strong>{session.material.keywords.length}</strong> keywords extracted ·{' '}
                  <strong>{session.material.quiz.length}</strong> pre-quiz question
                  {session.material.quiz.length === 1 ? '' : 's'} generated
                  <br />
                  OpenAI: {hasOpenAI() ? 'Connected' : 'Demo'} · Supabase: {hasSupabase() ? 'Configured' : 'Local'}
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
            <h2 className="upload-wizard-title">Pre-presentation check</h2>
            <div className="prequiz-intro-inline">
              <div className="quiz-badge">📋 PRE-PRESENTATION CHECK</div>
              <p className="upload-wizard-sublead">
                Answer each question in your own words — voice or typing. Confirm your answer to reveal the next question.
              </p>
              <div className="coach-question-tts-row">
                <button
                  type="button"
                  className="btn-sm"
                  onClick={() => {
                    primeFeedbackAudio();
                    void speakCoachQuestion(PRE_QUIZ_INTRO_TTS, selectedPersona);
                  }}
                >
                  Hear intro
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
                    Q {String(idx + 1).padStart(2, '0')} / {String(session.material.quiz.length).padStart(2, '0')}
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
                      Hear question
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
                        <strong>{passed ? 'Correct' : 'Incorrect'}</strong>
                        <span className="qc-grade-score">{gradeRow.score} pts</span>
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
                        Next question →
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
                  {isPreQuizGrading ? 'Grading...' : 'Submit all & Grade →'}
                </button>
              </div>
            )}

            {quizGraded && session.material.pre_quiz_score > 0 && (
              <div className="quiz-score quiz-score-visible quiz-score-after-grade">
                <div className="qs-label">Content comprehension score</div>
                <div className="qs-score">
                  {session.material.pre_quiz_score}
                  <span className="score-unit">pts</span>
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
                    transition('PRESENTING');
                  }}
                >
                  Start presentation →
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
            <AnimatedPointLogo onHomeClick={() => setAppStarted(false)} ariaLabel="Point — Home" />
          </div>
          <div className="upload-wizard-topbar-meta" aria-live="polite">
            <span className="upload-wizard-step-pill">Prepare</span>
            <span className="upload-wizard-step-count">
              Step {stepHuman} of {totalSteps}
            </span>
            <span className="upload-wizard-step-name">{stepLabel(currentId)}</span>
          </div>
          <div className="topbar-right">
            <button type="button" className="btn-sm" onClick={() => setAppStarted(false)}>
              ← Home
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!canStartPresenting}
              onClick={() => {
                stopCoachQuestionSpeech();
                transition('PRESENTING');
              }}
            >
              Start Presentation →
            </button>
          </div>
        </div>

        <div className="upload-area upload-wizard-area">
          {isPreQuizGrading && (
            <div className="quiz-grading-overlay" role="status" aria-live="polite" aria-busy="true">
              <div className="quiz-grading-card">
                <div className="quiz-grading-spinner" aria-hidden />
                <p className="quiz-grading-title">Grading...</p>
                <p className="quiz-grading-sub">AI is evaluating your answers. Please wait a moment.</p>
              </div>
            </div>
          )}

          <div className="upload-wizard-shell">{renderStepBody()}</div>

          <div className="upload-wizard-nav">
            <button type="button" className="btn-sm" onClick={goPrev} disabled={stepIndex <= 0 || isPreQuizGrading}>
              ← Back
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
                    ? 'Start presentation →'
                    : 'Next →'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
