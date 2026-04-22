import { useEffect, useMemo, useState } from 'react';
import { hasOpenAI } from '../lib/openai';
import { hasSupabase } from '../lib/supabase';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { useSessionStore } from '../store/sessionStore';
import { PRE_QUIZ_PASS_SCORE } from '../types/session';
import type { SessionContext } from '../types/session';
import { FileSubmissionPanel } from './FileSubmissionPanel';
import { PresentationTopicPanel } from './PresentationTopicPanel';
import { ScriptUploadPanel } from './ScriptUploadPanel';
import { AnimatedPointLogo } from './AnimatedPointLogo';

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
  | 'topics'
  | 'files'
  | 'script'
  | 'analyze'
  | 'quiz_intro'
  | 'quiz_submit'
  | 'wrap_up'
  | (string & {});

function analysisReady(session: SessionContext): boolean {
  return session.status === 'PRE_QUIZ' && Boolean(session.material.summary?.trim());
}

function buildPrepareSteps(session: SessionContext): PrepareStepId[] {
  const out: PrepareStepId[] = ['topics', 'files', 'script', 'analyze'];
  if (!analysisReady(session)) {
    return out;
  }
  if (session.material.quiz.length > 0) {
    out.push('quiz_intro');
    for (const q of session.material.quiz) {
      out.push(`quiz:${q.id}` as PrepareStepId);
    }
    out.push('quiz_submit');
  }
  out.push('wrap_up');
  return out;
}

function stepLabel(id: PrepareStepId): string {
  if (id === 'topics') return 'Presentation context';
  if (id === 'files') return 'Upload materials';
  if (id === 'script') return 'Optional script';
  if (id === 'analyze') return 'AI analysis';
  if (id === 'quiz_intro') return 'Pre-quiz intro';
  if (id === 'quiz_submit') return 'Submit pre-quiz';
  if (id === 'wrap_up') return 'Ready to present';
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

  const steps = useMemo(() => buildPrepareSteps(session), [
    session.session_id,
    session.status,
    session.material.summary,
    session.material.quiz,
  ]);

  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    setStepIndex(0);
  }, [session.session_id]);

  useEffect(() => {
    setStepIndex((i) => Math.min(i, Math.max(0, steps.length - 1)));
  }, [steps.length]);

  const currentId = steps[Math.min(stepIndex, steps.length - 1)] ?? 'topics';
  const totalSteps = steps.length;
  const stepHuman = Math.min(stepIndex + 1, totalSteps);

  const canStartPresenting =
    session.status === 'PRE_QUIZ' &&
    Boolean(session.material.summary?.trim()) &&
    !busy;

  const isPreQuizGrading = busy === 'Grading...';

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
      case 'topics':
      case 'files':
      case 'script':
        return true;
      case 'analyze':
        return analysisReady(session);
      case 'quiz_intro':
        return true;
      case 'quiz_submit':
        return quizGraded;
      case 'wrap_up':
        return false;
      default:
        if (String(currentId).startsWith('quiz:')) {
          const qid = Number(String(currentId).replace('quiz:', ''));
          return Boolean(preQuizAnswers[qid]?.trim());
        }
        return true;
    }
  };

  const goNext = () => {
    if (stepIndex < steps.length - 1 && canGoNext()) setStepIndex((i) => i + 1);
  };

  const goPrev = () => {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  };

  const renderStepBody = () => {
    switch (currentId) {
      case 'topics':
        return (
          <div className="upload-wizard-panel">
            <h2 className="upload-wizard-title">Step 1 — Presentation context</h2>
            <p className="upload-wizard-lead">
              Tell Point what this deck is about. This shapes coaching tone and quiz focus.
            </p>
            <PresentationTopicPanel />
          </div>
        );
      case 'files':
        return (
          <div className="upload-wizard-panel">
            <h2 className="upload-wizard-title">Step 2 — Upload materials</h2>
            <p className="upload-wizard-lead">
              Add slides or documents, then use <strong>Save</strong> in the panel so they are applied to this session.
            </p>
            <FileSubmissionPanel globalBusy={!!busy} />
          </div>
        );
      case 'script':
        return (
          <div className="upload-wizard-panel">
            <h2 className="upload-wizard-title">Step 3 — Optional script</h2>
            <p className="upload-wizard-lead">
              If you have a written script, add it for better plan-vs-actual feedback in your report. You can skip this step.
            </p>
            <ScriptUploadPanel />
          </div>
        );
      case 'analyze':
        return (
          <div className="upload-wizard-panel">
            <h2 className="upload-wizard-title">Step 4 — AI analysis &amp; quiz</h2>
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
      case 'quiz_intro':
        return (
          <div className="upload-wizard-panel">
            <h2 className="upload-wizard-title">Pre-quiz</h2>
            <p className="upload-wizard-lead">
              Before you present, a few open-ended questions check how well you know your material. You can still start
              the live session without grading — use <strong>Next</strong> to answer one question at a time.
            </p>
            <div className="quiz-badge">📋 PRE-PRESENTATION CHECK</div>
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
      case 'wrap_up':
        return (
          <div className="upload-wizard-panel">
            <h2 className="upload-wizard-title">You&apos;re set</h2>
            <p className="upload-wizard-lead">
              When you&apos;re ready, start the live session. Your coach will use this prep in feedback and reporting.
            </p>
            {session.material.pre_quiz_score > 0 && (
              <div className="quiz-score quiz-score-visible">
                <div className="qs-label">Content comprehension score</div>
                <div className="qs-score">
                  {session.material.pre_quiz_score}
                  <span className="score-unit">pts</span>
                </div>
              </div>
            )}
            <button
              type="button"
              className="btn-primary upload-wizard-start-big"
              disabled={!canStartPresenting}
              onClick={() => transition('PRESENTING')}
            >
              Start presentation →
            </button>
            {!canStartPresenting && (
              <p className="upload-wizard-hint-muted">Finish AI analysis above if the button stays disabled.</p>
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
          return (
            <div className="upload-wizard-panel">
              <h2 className="upload-wizard-title">
                Question {idx + 1} of {session.material.quiz.length}
              </h2>
              <p className="upload-wizard-lead">Answer in your own words — voice or typing.</p>
              <div className={`quiz-card ${gradedCls}`.trim()}>
                <div className="qc-num">Q {String(idx + 1).padStart(2, '0')}</div>
                <div className="qc-question">{q.question}</div>
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
            {currentId !== 'wrap_up' && currentId !== 'quiz_submit' && (
              <button
                type="button"
                className="btn-primary"
                onClick={goNext}
                disabled={!canGoNext() || isPreQuizGrading}
              >
                Next →
              </button>
            )}
            {currentId === 'quiz_submit' && quizGraded && (
              <button type="button" className="btn-primary" onClick={goNext} disabled={isPreQuizGrading}>
                Continue →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
