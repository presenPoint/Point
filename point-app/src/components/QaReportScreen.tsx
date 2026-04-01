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
          📥 리포트 저장
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            resetSession();
            setAppStarted(false);
          }}
        >
          새 발표 시작
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
    ? `총 발표 시간 ${formatDuration(session.speech_coaching.total_duration_sec)} · ${new Date(session.report.generated_at || Date.now()).toLocaleString('ko-KR')}`
    : `Q&A 진행 중 · 총 발표 시간 ${formatDuration(session.speech_coaching.total_duration_sec)}`;

  return (
    <div id="screen-qa" className="point-screen">
      <div className="qa-shell">
        <QaTopBar sessionDone={done} />

        <div className="qa-main">
          <div className="report-side">
            <h2>{done ? '발표 종합 리포트' : '리포트 미리보기'}</h2>
            <div className="report-sub">{subLine}</div>

            {done ? (
              <>
                <div className="score-row">
                  <div className="score-circle">
                    <ScoreRing value={session.report.speech_score} colorVar="var(--cyan)" />
                    <div className="circle-label">
                      언어적
                      <br />
                      코칭
                    </div>
                  </div>
                  <div className="score-circle">
                    <ScoreRing value={session.report.nonverbal_score} colorVar="var(--violet)" />
                    <div className="circle-label">
                      비언어적
                      <br />
                      코칭
                    </div>
                  </div>
                  <div className="score-circle">
                    <ScoreRing value={session.report.qa_score} colorVar="var(--green)" />
                    <div className="circle-label">
                      Q&A
                      <br />
                      전달력
                    </div>
                  </div>
                  <div className="score-circle">
                    <ScoreRing value={session.report.composite_score} colorVar="var(--amber)" />
                    <div className="circle-label">
                      종합
                      <br />
                      점수
                    </div>
                  </div>
                </div>

                <div className="report-section-title">잘한 점 👍</div>
                <div className="insight-list">
                  {session.report.strengths.map((s, i) => (
                    <div key={i} className="insight-item positive">
                      <div className="insight-icon">✅</div>
                      <div className="insight-content">
                        <div className="insight-title">포인트 {i + 1}</div>
                        <div className="insight-desc">{s}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="report-section-title">개선이 필요한 점 ⚠</div>
                <div className="insight-list">
                  {session.report.improvements.map((s, i) => (
                    <div key={i} className="insight-item negative">
                      <div className="insight-icon">⚠️</div>
                      <div className="insight-content">
                        <div className="insight-title">개선 {i + 1}</div>
                        <div className="insight-desc">{s}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="insight-list">
                <div className="insight-item insight-item-pending">
                  <div className="insight-icon" aria-hidden="true">⏳</div>
                  <div className="insight-content">
                    <div className="insight-title">Q&A 완료 후 생성됩니다</div>
                    <div className="insight-desc">
                      오른쪽 채팅에서 5회 질문에 답하면 종합 점수와 코멘트가 여기 표시됩니다.
                    </div>
                  </div>
                </div>
                {reporting && (
                  <div className="insight-item insight-item-reporting">
                    <div className="insight-icon" aria-hidden="true">✨</div>
                    <div className="insight-content">
                      <div className="insight-title">리포트 생성 중…</div>
                      <div className="insight-desc">{busy || '잠시만 기다려 주세요.'}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="qa-chat-side">
            <div className="qac-header">
              <div className="qac-title">🤖 AI 질의응답</div>
              <div className="qac-sub">발표 내용을 학습한 AI가 청중으로서 질문합니다 ({session.qa.exchanges.length}/5)</div>
            </div>

            <div className="chat-messages">
              <div className="msg ai">
                <div className="msg-bubble">
                  안녕하세요! 발표 수고하셨습니다. 발표 자료를 바탕으로 몇 가지 질문을 드릴게요. 🎤
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
                    <div className="msg-meta">나</div>
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
                <div className="voice-done-msg">Q&A가 종료되었습니다.</div>
              ) : textFallback ? (
                <>
                  <div className="text-input-row">
                    <textarea
                      className="chat-input"
                      placeholder="답변을 입력하세요..."
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
                      aria-label="전송"
                    >
                      전송 ↑
                    </button>
                  </div>
                  <button type="button" className="voice-mode-toggle" onClick={() => setTextFallback(false)}>
                    🎙 음성 입력으로 전환
                  </button>
                </>
              ) : (
                <>
                  <div className="voice-transcript-box">
                    {transcript ? (
                      <span className="voice-transcript-text">{transcript}</span>
                    ) : (
                      <span className="voice-placeholder">
                        {listening ? '녹음 중...' : transcribing ? '변환 중...' : '🎙 마이크를 눌러 음성으로 답변하세요'}
                      </span>
                    )}
                    {listening && <span className="voice-pulse" />}
                    {transcribing && <span className="voice-spinner" />}
                  </div>
                  {sttError && (
                    <div className="voice-error">
                      {sttError}
                      <button type="button" className="voice-fallback-btn" onClick={() => setTextFallback(true)}>
                        ⌨ 텍스트로 입력하기
                      </button>
                    </div>
                  )}
                  <div className="voice-actions">
                    <button
                      type="button"
                      className={`btn-mic${listening ? ' recording' : ''}`}
                      disabled={reporting || !qaCurrentQuestion || !!busy || transcribing}
                      onClick={toggleMic}
                      aria-label={listening ? '녹음 중지' : '음성 녹음'}
                    >
                      {listening ? '⏹' : transcribing ? '...' : '🎙'}
                    </button>
                    <button
                      type="button"
                      className="btn-send"
                      disabled={!transcript.trim() || reporting || !qaCurrentQuestion || !!busy || transcribing}
                      onClick={onSend}
                      aria-label="전송"
                    >
                      전송 ↑
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
