import { useEffect, useRef, useState } from 'react';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { useSessionStore } from '../store/sessionStore';
import { ScoreRing } from './ScoreRing';

function QaTopBar({ sessionDone }: { sessionDone: boolean }) {
  const resetSession = useSessionStore((s) => s.resetSession);
  const setAppStarted = useSessionStore((s) => s.setAppStarted);
  const persistSession = useSessionStore((s) => s.persistSession);

  return (
    <div className="topbar">
      <div className="topbar-logo">Point</div>
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
        <button type="button" className="btn-sm" onClick={() => void persistSession()}>
          📥 Save Report
        </button>
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
  const qaCurrentQuestion = useSessionStore((s) => s.qaCurrentQuestion);
  const busy = useSessionStore((s) => s.busy);
  const startQa = useSessionStore((s) => s.startQa);
  const submitQaAnswer = useSessionStore((s) => s.submitQaAnswer);
  const { transcript, listening, transcribing, error: sttError, start: startSTT, stop: stopSTT, reset: resetSTT } = useSpeechToText();
  const [textFallback, setTextFallback] = useState(false);
  const [textAnswer, setTextAnswer] = useState('');
  const qaInit = useRef(false);

  const done = session.status === 'DONE';
  const reporting = session.status === 'REPORT';

  useEffect(() => {
    qaInit.current = false;
  }, [session.session_id]);

  useEffect(() => {
    if (done || reporting) return;
    if (qaInit.current) return;
    qaInit.current = true;
    void startQa();
  }, [startQa, done, reporting]);

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

  const subLine = done
    ? `Total duration ${formatDuration(session.speech_coaching.total_duration_sec)} · ${new Date(session.report.generated_at || Date.now()).toLocaleString('en-US')}`
    : `Q&A in progress · Total duration ${formatDuration(session.speech_coaching.total_duration_sec)}`;

  return (
    <div id="screen-qa" className="point-screen">
      <div className="qa-shell">
        <QaTopBar sessionDone={done} />

        <div className="qa-main">
          <div className="report-side">
            <h2>{done ? 'Presentation Report' : 'Report Preview'}</h2>
            <div className="report-sub">{subLine}</div>

            {done ? (
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
                    <ScoreRing value={session.report.qa_score} colorVar="var(--green)" />
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
                    return (
                      <div key={i} className="coaching-card">
                        <div className="coaching-header">
                          <span className="coaching-number">{i + 1}</span>
                          <span className="coaching-label">{item.label}</span>
                        </div>
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
              </>
            ) : (
              <div className="insight-list">
                <div className="insight-item insight-item-pending">
                  <div className="insight-icon" aria-hidden="true">⏳</div>
                  <div className="insight-content">
                    <div className="insight-title">Generated after Q&A</div>
                    <div className="insight-desc">
                      Answer 5 questions in the chat and your overall score and feedback will appear here.
                    </div>
                  </div>
                </div>
                {reporting && (
                  <div className="insight-item insight-item-reporting">
                    <div className="insight-icon" aria-hidden="true">✨</div>
                    <div className="insight-content">
                      <div className="insight-title">Generating report...</div>
                      <div className="insight-desc">{busy || 'Please wait.'}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="qa-chat-side">
            <div className="qac-header">
              <div className="qac-title">🤖 AI Q&A</div>
              <div className="qac-sub">AI asks questions as your audience ({session.qa.exchanges.length}/5)</div>
            </div>

            <div className="chat-messages">
              <div className="msg ai">
                <div className="msg-bubble">
                  Great presentation! I'll ask a few questions based on your materials. 🎤
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
              {!done &&
                !busy &&
                qaCurrentQuestion &&
                session.qa.exchanges.length < 5 &&
                session.qa.exchanges.at(-1)?.question !== qaCurrentQuestion && (
                  <div className="msg ai">
                    <div className="msg-bubble">{qaCurrentQuestion}</div>
                    <div className="msg-meta">Point AI</div>
                  </div>
                )}
              {busy && !done && (
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
              {done ? (
                <div className="voice-done-msg">Q&A session has ended.</div>
              ) : textFallback ? (
                <>
                  <div className="text-input-row">
                    <textarea
                      className="chat-input"
                      placeholder="Type your answer..."
                      rows={2}
                      value={textAnswer}
                      disabled={reporting || !qaCurrentQuestion || !!busy}
                      onChange={(e) => setTextAnswer(e.target.value)}
                      onKeyDown={onKeyDown}
                    />
                    <button
                      type="button"
                      className="btn-send"
                      disabled={!textAnswer.trim() || reporting || !qaCurrentQuestion || !!busy}
                      onClick={onSend}
                      aria-label="Send"
                    >
                      Send ↑
                    </button>
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
                        {listening ? 'Recording...' : transcribing ? 'Transcribing...' : '🎙 Press mic to answer with voice'}
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
                      disabled={reporting || !qaCurrentQuestion || !!busy || transcribing}
                      onClick={toggleMic}
                      aria-label={listening ? 'Stop recording' : 'Voice recording'}
                    >
                      {listening ? '⏹' : transcribing ? '...' : '🎙'}
                    </button>
                    <button
                      type="button"
                      className="btn-send"
                      disabled={!transcript.trim() || reporting || !qaCurrentQuestion || !!busy || transcribing}
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
      </div>
    </div>
  );
}
