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
  'Here is your short warm-up before you present. Go through each question with Next. You can answer with your voice or by typing.';

function VoiceQuizInput({ value, onChange, disabled }: {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}) {
  const { transcript, listening, transcribing, error, start, stop, reset } = useSpeechToText();
  const [useTextFallback, setUseTextFallback] = useState(false);

  const toggleMic = () => {
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

/** 발표 준비 마법사 단계 id — 퀴즈 문항은 `quiz:<questionId>` */
export type PrepareStepId =
  | 'material_prep'
  | 'script'
  | 'analyze'
  | 'quiz_submit'
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
    for (const q of session.material.quiz) {
      out.push(`quiz:${q.id}` as PrepareStepId);
    }
    out.push('quiz_submit');
  }
  return out;
}

function stepLabel(id: PrepareStepId): string {
  if (id === 'material_prep') return 'Topic & materials';
  if (id === 'script') return 'Optional script';
  if (id === 'analyze') return 'AI analysis';
  if (id === 'quiz_submit') return 'Submit pre-quiz';
  if (id.startsWith('quiz:')) return 'Pre-quiz question';
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
  const filesPanelRef = useRef<FileSubmissionPanelHandle>(null);
  /** 자료 추출 중 등 — Topic & materials 단계에서 Next 비활성 */
  const [filesStepBlocked, setFilesStepBlocked] = useState(false);

  useEffect(() => {
    setStepIndex(0);
  }, [session.session_id]);

  useEffect(() => {
    setStepIndex((i) => Math.min(i, Math.max(0, steps.length - 1)));
  }, [steps.length]);

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

  useEffect(() => {
    if (busy || isPreQuizGrading) return;
    if (String(currentId).startsWith('quiz:')) {
      const qid = Number(String(currentId).replace('quiz:', ''));
      const q = session.material.quiz.find((x) => x.id === qid);
      if (!q?.question?.trim()) {
        stopCoachQuestionSpeech();
        return undefined;
      }
      const firstId = session.material.quiz[0]?.id;
      const isFirstQuiz = firstId != null && qid === firstId;
      if (isFirstQuiz) {
        const tIntro = window.setTimeout(() => void speakCoachQuestion(PRE_QUIZ_INTRO_TTS, selectedPersona), 450);
        const tQ = window.setTimeout(() => void speakCoachQuestion(q.question, selectedPersona), 2800);
        return () => {
          window.clearTimeout(tIntro);
          window.clearTimeout(tQ);
          stopCoachQuestionSpeech();
        };
      }
      const t = window.setTimeout(() => void speakCoachQuestion(q.question, selectedPersona), 450);
      return () => {
        window.clearTimeout(t);
        stopCoachQuestionSpeech();
      };
    }
    stopCoachQuestionSpeech();
    return undefined;
  }, [currentId, selectedPersona, busy, isPreQuizGrading, session.material.quiz]);

  const allQuizAnswered =
    session.material.quiz.length > 0 &&
    session.material.quiz.every((q) => Boolean(preQuizAnswers[q.id]?.trim()));

  const quizGraded =
    session.material.quiz.length > 0 &&
    session.material.quiz.every((q) =>
      session.material.pre_quiz_grades.some((g) => g.id === q.id),
    );

  const canGoNext = (): boolean => {
    switch (currentId) {
      case 'material_prep':
      case 'script':
        return true;
      case 'analyze':
        return analysisReady(session);
      case 'quiz_submit':
        return quizGraded;
      default:
        if (String(currentId).startsWith('quiz:')) {
          const qid = Number(String(currentId).replace('quiz:', ''));
          return Boolean(preQuizAnswers[qid]?.trim());
        }
        return true;
    }
  };

  const goNext = () => {
    if (currentId === 'material_prep') {
      const h = filesPanelRef.current;
      if (h?.hasEntries() && !h.save()) return;
      if (h?.hasEntries()) useToastStore.getState().showToast('저장 완료');
    }

    /* 마지막 준비 단계 — 별도 "You're set" 화면 없이 바로 라이브 */
    if (currentId === 'quiz_submit' && quizGraded) {
      if (!canStartPresenting) return;
      transition('PRESENTING');
      return;
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
      case 'quiz_submit':
        return (
          <div className="upload-wizard-panel upload-wizard-panel--wide">
            <h2 className="upload-wizard-title">Review &amp; submit</h2>
            <p className="upload-wizard-lead">
              Check your answers, then submit for AI grading (70-point pass per question). You can go back to edit any
              question.
            </p>
            {session.material.quiz.map((q, idx) => {
              const gradeRow = session.material.pre_quiz_grades.find((g) => g.id === q.id);
              const passed = gradeRow != null && gradeRow.score >= PRE_QUIZ_PASS_SCORE;
              const gradedCls = gradeRow != null ? (passed ? 'qc-graded-pass' : 'qc-graded-fail') : '';
              return (
                <div key={q.id} className={`quiz-card ${gradedCls}`.trim()}>
                  <div className="qc-num">Q {String(idx + 1).padStart(2, '0')} / {String(session.material.quiz.length).padStart(2, '0')}</div>
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
                </div>
              );
            })}
            {quizGraded && session.material.pre_quiz_score > 0 && (
              <div className="quiz-score quiz-score-visible quiz-score-after-grade">
                <div className="qs-label">Content comprehension score</div>
                <div className="qs-score">
                  {session.material.pre_quiz_score}
                  <span className="score-unit">pts</span>
                </div>
              </div>
            )}
            {!quizGraded && (
              <div className="qc-footer qc-footer-left">
                <button
                  type="button"
                  className="btn-submit-q"
                  disabled={!!busy || !allQuizAnswered}
                  onClick={() => void submitPreQuiz()}
                >
                  {isPreQuizGrading ? 'Grading...' : 'Submit all & Grade →'}
                </button>
              </div>
            )}
          </div>
        );
      default:
        if (String(currentId).startsWith('quiz:')) {
          const qid = Number(String(currentId).replace('quiz:', ''));
          const q = session.material.quiz.find((x) => x.id === qid);
          const idx = session.material.quiz.findIndex((x) => x.id === qid);
          if (!q) return <p className="quiz-empty-hint">Question not found.</p>;
          const gradeRow = session.material.pre_quiz_grades.find((g) => g.id === q.id);
          const passed = gradeRow != null && gradeRow.score >= PRE_QUIZ_PASS_SCORE;
          const gradedCls = gradeRow != null ? (passed ? 'qc-graded-pass' : 'qc-graded-fail') : '';
          const showPreQuizIntro = idx === 0;
          return (
            <div className="upload-wizard-panel">
              <h2 className="upload-wizard-title">
                Question {idx + 1} of {session.material.quiz.length}
              </h2>
              <p className="upload-wizard-lead">Answer in your own words — voice or typing.</p>
              {showPreQuizIntro && (
                <div className="prequiz-intro-inline">
                  <div className="quiz-badge">📋 PRE-PRESENTATION CHECK</div>
                  <p className="upload-wizard-sublead">
                    A few open-ended questions check how well you know your material. Use <strong>Next</strong> between
                    questions.
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
              )}
              <div className={`quiz-card ${gradedCls}`.trim()}>
                <div className="qc-num">Q {String(idx + 1).padStart(2, '0')}</div>
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
              </div>
            </div>
          );
        }
        return null;
    }
  };

  return (
    <div id="screen-upload" className="point-screen">
      <div className="app-shell">
        <div className="topbar">
          <div className="topbar-logo" aria-label="Point">
            <AnimatedPointLogo />
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
              onClick={() => transition('PRESENTING')}
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
              {currentId !== 'quiz_submit' && (
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
              {currentId === 'quiz_submit' && quizGraded && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={goNext}
                  disabled={isPreQuizGrading || !canStartPresenting}
                >
                  Start presentation →
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
