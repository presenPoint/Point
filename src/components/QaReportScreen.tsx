import { useEffect, useRef, useState } from 'react';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { useSessionStore } from '../store/sessionStore';
import { downloadReportPdfFromElement } from '../lib/reportPdf';
import { ScoreRing } from './ScoreRing';
import { ReportTranscriptSection } from './ReportTranscriptSection';
import { AnimatedPointLogo } from './AnimatedPointLogo';

function QaTopBar({
  sessionDone,
  onExportPdf,
  pdfExporting,
}: {
  sessionDone: boolean;
  onExportPdf?: () => void | Promise<void>;
  pdfExporting?: boolean;
}) {
  const resetSession = useSessionStore((s) => s.resetSession);
  const setAppStarted = useSessionStore((s) => s.setAppStarted);

  return (
    <div className="topbar">
      <div className="topbar-logo" aria-label="Point">
        <AnimatedPointLogo />
      </div>
      <div className="topbar-steps">
        <div className="step-dot done">✓</div>
        <div className="step-line" />
        <div className="step-dot done">✓</div>
        <div className="step-line" />
        <div className="step-dot done">✓</div>
        <div className="step-line" />
        <div className={sessionDone ? 'step-dot done' : 'step-dot active'}>
          {sessionDone ? '✓' : '4'}
        </div>
      </div>
      <div className="topbar-right">
        {sessionDone && onExportPdf && (
          <button
            type="button"
            className="btn-sm qa-pdf-export-btn"
            disabled={pdfExporting}
            onClick={() => void onExportPdf()}
          >
            {pdfExporting ? 'Preparing PDF…' : '📄 PDF Download'}
          </button>
        )}
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            resetSession();
            setAppStarted(false);
          }}
        >
          New Presentation
        </button>
      </div>
    </div>
  );
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function QaReportScreen() {
  const session = useSessionStore((s) => s.session);
  const selectedPersona = useSessionStore((s) => s.selectedPersona);
  const qaCurrentQuestion = useSessionStore((s) => s.qaCurrentQuestion);
  const busy = useSessionStore((s) => s.busy);
  const startQa = useSessionStore((s) => s.startQa);
  const submitQaAnswer = useSessionStore((s) => s.submitQaAnswer);
  const skipQaAndRunReport = useSessionStore((s) => s.skipQaAndRunReport);
  const { transcript, listening, transcribing, error: sttError, start: startSTT, stop: stopSTT, reset: resetSTT } = useSpeechToText();
  const [textFallback, setTextFallback] = useState(false);
  const [textAnswer, setTextAnswer] = useState('');
  const [pdfExporting, setPdfExporting] = useState(false);
  const qaInit = useRef(false);
  const reportPdfRootRef = useRef<HTMLDivElement>(null);

  const done = session.status === 'DONE';
  const reporting = session.status === 'REPORT';
  /** Step 2: Q&A 채점 중이거나 최종 보고서 생성 중 */
  const showGenerating =
    session.status === 'REPORT' || (session.status === 'POST_QA' && busy === 'Grading Q&A…');
  const showQaPass =
    !done && session.status === 'POST_QA' && !session.qa_skipped && !showGenerating;

  const reportSubLine = done
    ? `Total duration ${formatDuration(session.speech_coaching.total_duration_sec)} · ${new Date(session.report.generated_at || Date.now()).toLocaleString('en-US')}`
    : '';

  useEffect(() => {
    qaInit.current = false;
  }, [session.session_id]);

  useEffect(() => {
    if (done || reporting || session.qa_skipped) return;
    if (qaInit.current) return;
    qaInit.current = true;
    void startQa();
  }, [startQa, done, reporting, session.qa_skipped, session.session_id]);

  const onSend = () => {
    const text = textFallback ? textAnswer.trim() : transcript.trim();
    if (!text || busy || !qaCurrentQuestion) return;
    if (listening) stopSTT();
    void submitQaAnswer(text).then(() => {
      resetSTT();
      setTextAnswer('');
    });
  };

  const toggleMic = () => {
    if (listening) stopSTT();
    else void startSTT();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleExportPdf = async () => {
    setPdfExporting(true);
    try {
      await downloadReportPdfFromElement(reportPdfRootRef.current, session.session_id);
    } catch (err) {
      console.error('[Point] PDF export failed', err);
      window.alert(err instanceof Error ? err.message : 'Could not create the PDF. Please try again.');
    } finally {
      setPdfExporting(false);
    }
  };

  const wizardStep = done ? 3 : showGenerating ? 2 : 1;
  const wizardStepName = done ? 'Your report' : showGenerating ? 'Building report' : 'Audience Q&A';

  const reportScoresAndBody = (
    <>
      <div className="score-row">
                  <div className="score-circle">
                    <ScoreRing value={session.report.speech_score} colorVar="var(--cyan)" />
                    <div className="circle-label">
                      Verbal
                      <br />
                      Coaching
                    </div>
                  </div>
                  <div className="score-circle">
                    <ScoreRing value={session.report.nonverbal_score} colorVar="var(--violet)" />
                    <div className="circle-label">
                      Nonverbal
                      <br />
                      Coaching
                    </div>
                  </div>
                  <div className="score-circle">
                    {session.qa_skipped ? (
                      <div className="score-ring-skipped" aria-label="Q&A skipped">
                        <span className="score-ring-skipped-label">—</span>
                        <span className="score-ring-skipped-sub">Skipped</span>
                      </div>
                    ) : (
                      <ScoreRing value={session.report.qa_score} colorVar="var(--green)" />
                    )}
                    <div className="circle-label">
                      Q&A
                      <br />
                      Delivery
                    </div>
                  </div>
                  <div className="score-circle">
                    <ScoreRing value={session.report.composite_score} colorVar="var(--amber)" />
                    <div className="circle-label">
                      Overall
                      <br />
                      Score
                    </div>
                  </div>
                </div>

                {selectedPersona && session.report.persona_style_coaching && (
                  <>
                    <div className="report-section-title">Concrete delivery fixes</div>
                    <p className="report-corrections-lead">
                      {session.material.script_text.trim().length >= 20
                        ? 'Your uploaded manuscript vs what you actually said — same ideas, reshaped in your coach’s speaking style (pace, framing, signposting).'
                        : 'From your spoken transcript only (no manuscript on file) — delivery and wording in your coach’s voice, without inventing a script you did not provide.'}
                    </p>
                    {(session.report.persona_style_coaching.phrase_rewrites?.length ?? 0) > 0 ? (
                      <div className="report-rewrite-list report-rewrite-list--featured">
                        {session.report.persona_style_coaching.phrase_rewrites!.map((rw, i) => (
                          <div key={i} className="report-rewrite-card">
                            <div className="report-rewrite-label">What you said</div>
                            <p className="report-rewrite-from">{rw.from_session}</p>
                            <div className="report-rewrite-label report-rewrite-label-alt">Coach-style phrasing</div>
                            <p className="report-rewrite-to">{rw.persona_aligned_example}</p>
                            {rw.why && (
                              <>
                                <div className="report-rewrite-label report-rewrite-label-why">Why</div>
                                <p className="report-rewrite-why">{rw.why}</p>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="report-corrections-empty">
                        No line-level rewrites were generated for this session (often when the transcript was too short for fair quotes).
                      </div>
                    )}
                  </>
                )}

                <div className="report-section-title">Strengths 👍</div>
                <div className="insight-list">
                  {session.report.strengths.map((s, i) => (
                    <div key={i} className="insight-item positive">
                      <div className="insight-icon">✅</div>
                      <div className="insight-content">
                        <div className="insight-title">Point {i + 1}</div>
                        <div className="insight-desc">{s}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {session.report.persona_style_coaching && (
                  <>
                    <div className="report-section-title">Persona delivery roadmap</div>
                    <div className="report-persona-panel">
                      <p className="report-persona-alignment">
                        {session.report.persona_style_coaching.style_alignment}
                      </p>
                      <h4 className="report-persona-sub">Next-session practices</h4>
                      <ul className="report-persona-practices">
                        {session.report.persona_style_coaching.delivery_practices.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}

                <div className="report-section-title">Actionable Coaching</div>
                <div className="insight-list">
                  {(session.report.improvements as unknown as Array<{label: string; situation: string; stop_doing: string; start_doing: string; expected_impact: string} | string>).map((item, i) => {
                    if (typeof item === 'string') {
                      return (
                        <div key={i} className="insight-item negative">
                          <div className="insight-icon">⚠️</div>
                          <div className="insight-content">
                            <div className="insight-title">Improvement {i + 1}</div>
                            <div className="insight-desc">{item}</div>
                          </div>
                        </div>
                      );
                    }
                    const markers = (item as {time_markers?: {time: string; event: string}[]}).time_markers;
                    return (
                      <div key={i} className="coaching-card">
                        <div className="coaching-header">
                          <span className="coaching-number">{i + 1}</span>
                          <span className="coaching-label">{item.label}</span>
                        </div>
                        {markers && markers.length > 0 && (
                          <div className="coaching-timestamps">
                            {markers.map((m, mi) => (
                              <span key={mi} className="coaching-ts-badge">
                                <span className="ts-icon" aria-hidden="true">⏱</span>
                                <span className="ts-time">{m.time}</span>
                                <span className="ts-event">{m.event}</span>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="coaching-section">
                          <div className="coaching-tag tag-situation">SITUATION</div>
                          <p className="coaching-text">{item.situation}</p>
                        </div>
                        <div className="coaching-section">
                          <div className="coaching-tag tag-stop">STOP DOING</div>
                          <p className="coaching-text">{item.stop_doing}</p>
                        </div>
                        <div className="coaching-section">
                          <div className="coaching-tag tag-start">START DOING</div>
                          <p className="coaching-text">{item.start_doing}</p>
                        </div>
                        <div className="coaching-section">
                          <div className="coaching-tag tag-impact">EXPECTED IMPACT</div>
                          <p className="coaching-text coaching-impact">{item.expected_impact}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

      <ReportTranscriptSection
        transcriptLog={session.speech_coaching.transcript_log}
        sessionStartedAt={session.started_at}
        sessionId={session.session_id}
        selectedPersona={selectedPersona}
      />
    </>
  );

  const generatingTitle =
    busy === 'Grading Q&A…' ? 'Scoring your Q&A answers…' : 'Generating your presentation report…';

  return (
    <div id="screen-qa" className="point-screen">
      <div className="qa-shell qa-shell--wizard">
        <QaTopBar
          sessionDone={done}
          onExportPdf={handleExportPdf}
          pdfExporting={pdfExporting}
        />

        <div className="qa-wizard-stage-wrap">
          <div className="qa-wizard-top-meta" aria-live="polite">
            <span className="qa-wizard-pill">Wrap-up</span>
            <span className="qa-wizard-stepcount">Step {wizardStep} of 3</span>
            <span className="qa-wizard-stepname">{wizardStepName}</span>
          </div>

          {showGenerating ? (
            <div className="qa-wizard-stage qa-wizard-stage--center">
              <div className="qa-generating-card">
                <div className="quiz-grading-spinner" aria-hidden />
                <p className="qa-generating-title">{generatingTitle}</p>
                <p className="qa-generating-sub">{busy || 'Please wait…'}</p>
              </div>
            </div>
          ) : done ? (
            <div className="qa-wizard-stage qa-wizard-stage--report">
              <div ref={reportPdfRootRef} className="report-side report-side--wizard-solo report-side--pdf-root">
                <h2>Presentation Report</h2>
                <div className="report-sub">{reportSubLine}</div>
                {reportScoresAndBody}
              </div>
            </div>
          ) : (
            <div className="qa-wizard-stage qa-wizard-stage--qa">
              <div className="qa-chat-side qa-chat-side--wizard-solo">
                <div className="qa-wizard-qa-toolbar">
                  {showQaPass && (
                    <button
                      type="button"
                      className="btn-sm qa-skip-report-btn"
                      onClick={() => void skipQaAndRunReport()}
                    >
                      Skip Q&amp;A — get report
                    </button>
                  )}
                </div>
                <div className="qac-header">
                  <div className="qac-title">🤖 AI Q&A</div>
                  <div className="qac-sub">
                    AI asks questions as your audience ({session.qa.exchanges.length}/{session.qa.planned_rounds ?? 5})
                  </div>
                  <p className="qac-lead">
                    Answer {session.qa.planned_rounds ?? 5} questions, or use <strong>Pass</strong> by the mic to jump
                    straight to your report.
                  </p>
                </div>

                <div className="chat-messages">
                  <div className="msg ai">
                    <div className="msg-bubble">
                      Great presentation! I&apos;ll ask a few questions based on your materials. 🎤
                    </div>
                    <div className="msg-meta">Point AI</div>
                  </div>
                  {session.qa.exchanges.map((ex) => (
                    <div key={ex.turn}>
                      <div className="msg ai">
                        <div className="msg-bubble">{ex.question}</div>
                        <div className="msg-meta">Point AI · Q{ex.turn}</div>
                      </div>
                      <div className="msg user">
                        <div className="msg-bubble">{ex.answer}</div>
                        <div className="msg-meta">You</div>
                      </div>
                    </div>
                  ))}
                  {!showGenerating &&
                    !busy &&
                    qaCurrentQuestion &&
                    session.qa.exchanges.length < (session.qa.planned_rounds ?? 5) &&
                    session.qa.exchanges.at(-1)?.question !== qaCurrentQuestion && (
                      <div className="msg ai">
                        <div className="msg-bubble">{qaCurrentQuestion}</div>
                        <div className="msg-meta">Point AI</div>
                      </div>
                    )}
                  {busy && !showGenerating && (
                    <div className="msg ai">
                      <div className="msg-bubble">
                        <div className="ai-typing">
                          <div className="typing-dot" />
                          <div className="typing-dot" />
                          <div className="typing-dot" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="chat-input-area voice-input-area">
                  {textFallback ? (
                    <>
                      <div className="text-input-row">
                        <textarea
                          className="chat-input"
                          placeholder="Type your answer..."
                          rows={2}
                          value={textAnswer}
                          disabled={!qaCurrentQuestion || !!busy}
                          onChange={(e) => setTextAnswer(e.target.value)}
                          onKeyDown={onKeyDown}
                        />
                        <div className="text-input-side-actions">
                          {showQaPass && (
                            <button
                              type="button"
                              className="btn-sm qa-input-skip-btn"
                              title="Skip remaining Q&A and generate your report"
                              onClick={() => void skipQaAndRunReport()}
                            >
                              Pass
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-send"
                            disabled={!textAnswer.trim() || !qaCurrentQuestion || !!busy}
                            onClick={onSend}
                            aria-label="Send"
                          >
                            Send ↑
                          </button>
                        </div>
                      </div>
                      <button type="button" className="voice-mode-toggle" onClick={() => setTextFallback(false)}>
                        🎙 Switch to voice input
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="voice-transcript-box">
                        {transcript ? (
                          <span className="voice-transcript-text">{transcript}</span>
                        ) : (
                          <span className="voice-placeholder">
                            {listening
                              ? 'Recording...'
                              : transcribing
                                ? 'Transcribing...'
                                : '🎙 Press mic to answer with voice'}
                          </span>
                        )}
                        {listening && <span className="voice-pulse" />}
                        {transcribing && <span className="voice-spinner" />}
                      </div>
                      {sttError && (
                        <div className="voice-error">
                          {sttError}
                          <button type="button" className="voice-fallback-btn" onClick={() => setTextFallback(true)}>
                            ⌨ Switch to text input
                          </button>
                        </div>
                      )}
                      <div className="voice-actions">
                        <button
                          type="button"
                          className={`btn-mic${listening ? ' recording' : ''}`}
                          disabled={!qaCurrentQuestion || !!busy || transcribing}
                          onClick={toggleMic}
                          aria-label={listening ? 'Stop recording' : 'Voice recording'}
                        >
                          {listening ? '⏹' : transcribing ? '...' : '🎙'}
                        </button>
                        {showQaPass && (
                          <button
                            type="button"
                            className="btn-sm qa-input-skip-btn"
                            title="Skip remaining Q&A and generate your report"
                            onClick={() => void skipQaAndRunReport()}
                          >
                            Pass
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-send voice-send-btn"
                          disabled={!transcript.trim() || !qaCurrentQuestion || !!busy || transcribing}
                          onClick={onSend}
                          aria-label="Send"
                        >
                          Send ↑
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
