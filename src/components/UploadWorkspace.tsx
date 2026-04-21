import { useState } from 'react';
import { hasOpenAI } from '../lib/openai';
import { hasSupabase } from '../lib/supabase';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { useSessionStore } from '../store/sessionStore';
import { PRE_QUIZ_PASS_SCORE } from '../types/session';
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

function StepBar({ activeStep }: { activeStep: 1 | 2 | 3 | 4 }) {
  const dot = (n: number) => {
    if (n < activeStep) return 'step-dot done';
    if (n === activeStep) return 'step-dot active';
    return 'step-dot';
  };
  const label = (n: number) => (n < activeStep ? '✓' : String(n));
  return (
    <div className="topbar-steps">
      <div className={dot(1)}>{label(1)}</div>
      <div className="step-line" />
      <div className={dot(2)}>{label(2)}</div>
      <div className="step-line" />
      <div className={dot(3)}>{label(3)}</div>
      <div className="step-line" />
      <div className={dot(4)}>{label(4)}</div>
    </div>
  );
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

  const activeStep: 1 | 2 | 3 | 4 = session.status === 'PRE_QUIZ' ? 2 : 1;

  const canStartPresenting =
    session.status === 'PRE_QUIZ' &&
    Boolean(session.material.summary?.trim()) &&
    !busy;

  const isPreQuizGrading = busy === 'Grading...';

  return (
    <div id="screen-upload" className="point-screen">
      <div className="app-shell">
        <div className="topbar">
          <div className="topbar-logo" aria-label="Point">
            <AnimatedPointLogo />
          </div>
          <StepBar activeStep={activeStep} />
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

        <div className="upload-area">
          <div className="upload-main">
            <h2>Upload your presentation materials</h2>
            <p>
              AI analyzes your uploads to produce a summary and keywords, then generates open-ended quiz questions (Agent 1) to check how well you know the content.
              <br />
              Post-presentation Q&A (Agent 4) uses this summary and gaps surfaced in the pre-quiz; the end-of-session report (Agent 5) reflects them as well.
              <br />
              <span style={{ color: 'var(--muted)' }}>Add files, apply them to the session with 「Save」, then tap 「AI Analysis & Quiz Generation」.</span>
            </p>

            <PresentationTopicPanel />

            {/* File Submission & Script — side by side */}
            <div className="upload-panels-row">
              <FileSubmissionPanel globalBusy={!!busy} />
              <ScriptUploadPanel />
            </div>

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

            {session.status === 'PRE_QUIZ' && session.material.summary && (
              <div className="analysis-complete-card">
                <div className="analysis-badge" aria-label="Analysis complete">
                  🤖 AI ANALYSIS COMPLETE
                </div>
                <div className="analysis-detail">
                  <strong>{session.material.keywords.length}</strong> keywords extracted ·{' '}
                  <strong>3</strong> pre-quiz questions generated
                  <br />
                  OpenAI: {hasOpenAI() ? 'Connected' : 'Demo'} · Supabase: {hasSupabase() ? 'Configured' : 'Local'}
                </div>
              </div>
            )}
          </div>

          <div className="quiz-panel">
            <div className="quiz-header">
              <div className="quiz-badge">📋 PRE-PRESENTATION CHECK</div>
              <div className="quiz-title">Content Comprehension Check</div>
              <div className="quiz-sub">
                Before you present, AI asks about key ideas. Answer to gauge how ready you are.
                <br />
                After you submit all, each item shows correct/incorrect (70-point threshold) and feedback. The quiz is optional—you can still use 「Start Presentation」 at the top without grading.
              </div>
            </div>

            {isPreQuizGrading && (
              <div className="quiz-grading-overlay" role="status" aria-live="polite" aria-busy="true">
                <div className="quiz-grading-card">
                  <div className="quiz-grading-spinner" aria-hidden />
                  <p className="quiz-grading-title">Grading...</p>
                  <p className="quiz-grading-sub">AI is evaluating your answers. Please wait a moment.</p>
                </div>
              </div>
            )}

            {session.status === 'PRE_QUIZ' && session.material.quiz.length > 0 ? (
              session.material.quiz.map((q, idx) => {
                const answered = Boolean(preQuizAnswers[q.id]?.trim());
                const gradeRow = session.material.pre_quiz_grades.find((g) => g.id === q.id);
                const passed = gradeRow != null && gradeRow.score >= PRE_QUIZ_PASS_SCORE;
                const gradedCls =
                  gradeRow != null ? (passed ? 'qc-graded-pass' : 'qc-graded-fail') : '';
                return (
                  <div
                    key={q.id}
                    className={`quiz-card ${answered ? 'answered' : ''} ${gradedCls}`.trim()}
                  >
                    <div className="qc-num">
                      Q {String(idx + 1).padStart(2, '0')} / 03
                    </div>
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
              })
            ) : (
              <p className="quiz-empty-hint">
                Run analysis on the left to see the quiz here.
              </p>
            )}

            {session.status === 'PRE_QUIZ' && session.material.quiz.length > 0 && (
              <div className="qc-footer qc-footer-left">
                <button
                  type="button"
                  className="btn-submit-q"
                  disabled={!!busy}
                  onClick={() => void submitPreQuiz()}
                >
                  {isPreQuizGrading ? 'Grading...' : 'Submit All & Grade →'}
                </button>
              </div>
            )}

            {session.material.pre_quiz_score > 0 && (
              <div className="quiz-score quiz-score-visible">
                <div className="qs-label">Content comprehension score</div>
                <div className="qs-score">
                  {session.material.pre_quiz_score}
                  <span className="score-unit">pts</span>
                </div>
                <div className="score-guide">
                  Go to the live session with 「Start Presentation」 at the top.
                </div>
              </div>
            )}

            {session.status === 'PRE_QUIZ' &&
              session.material.summary &&
              session.material.pre_quiz_score <= 0 && (
                <p className="quiz-hint">
                  You can skip the quiz and go straight to 「Start Presentation」 once analysis is done.
                </p>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
