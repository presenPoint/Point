import { useEffect, useRef, useState } from 'react';
import { feedbackQueue } from '../agents';
import { useLivePresenting } from '../hooks/useLivePresenting';
import { cancelFeedbackSpeech, enqueueFeedback, onSpeakingChange, primeFeedbackAudio } from '../lib/feedbackTts';
import { saveTranscriptToBlob } from '../lib/transcriptStorage';
import { useSessionStore } from '../store/sessionStore';
import type { FeedbackItem, FeedbackLevel } from '../types/session';
import { AnimatedPointLogo } from './AnimatedPointLogo';

function formatMmSs(sec: number): string {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function levelToFeedClass(level: FeedbackLevel): string {
  if (level === 'CRITICAL') return 'type-alert';
  if (level === 'WARN') return 'type-warn';
  return 'type-info';
}

function sourceToCat(source: FeedbackItem['source']): { cls: string; label: string } {
  if (source === 'SPEECH_RULE' || source === 'SPEECH_SEMANTIC') return { cls: 'cat-voice', label: 'VOICE' };
  return { cls: 'cat-gaze', label: 'NONVERBAL' };
}

export function LiveSessionScreen() {
  const { presentingStartRef, startPoseTracking, stopPoseTracking } = useLivePresenting();
  const transition = useSessionStore((s) => s.transition);
  const session = useSessionStore((s) => s.session);
  const live = useSessionStore((s) => s.livePresentation);

  const [sec, setSec] = useState(0);
  const [feed, setFeed] = useState<FeedbackItem[]>([]);
  const [coachVisual, setCoachVisual] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const voiceFeedbackRef = useRef(false);
  const [alertUi, setAlertUi] = useState<{
    msg: string;
    typeLabel: string;
    color: string;
  } | null>(null);
  const lastAlertId = useRef<string | null>(null);
  const alertT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [camOn, setCamOn] = useState(false);

  useEffect(() => {
    const t = window.setInterval(() => {
      setSec(Math.round((Date.now() - presentingStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [presentingStartRef]);

  useEffect(() => onSpeakingChange(setIsSpeaking), []);

  useEffect(() => {
    voiceFeedbackRef.current = !coachVisual;
  }, [coachVisual]);

  useEffect(() => {
    if (coachVisual) cancelFeedbackSpeech();
  }, [coachVisual]);

  useEffect(() => {
    const sync = () => {
      setFeed([...feedbackQueue.getFeedHistory()]);
      const items = feedbackQueue.getDisplayItems();
      const top = items[0];
      if (top && top.id !== lastAlertId.current) {
        lastAlertId.current = top.id;
        const color =
          top.level === 'CRITICAL' ? 'var(--red)' : top.level === 'WARN' ? 'var(--amber)' : 'var(--cyan)';
        const typeLabel =
          top.source === 'NONVERBAL' ? 'NONVERBAL' : top.level === 'CRITICAL' ? 'ALERT' : 'VOICE COACH';
        setAlertUi({ msg: top.msg, typeLabel, color });
        if (alertT.current) clearTimeout(alertT.current);
        alertT.current = setTimeout(() => setAlertUi(null), 3500);
        if (voiceFeedbackRef.current) {
          enqueueFeedback(top.msg, {
            level: top.level,
            preempt: top.level === 'CRITICAL',
          });
        }
      }
    };
    sync();
    const unsub = feedbackQueue.subscribe(sync);
    return () => {
      unsub();
      if (alertT.current) clearTimeout(alertT.current);
      cancelFeedbackSpeech();
    };
  }, []);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [feed]);

  const wpm = live.wpm;
  const fillers = session.speech_coaching.filler_count || live.fillerCount;
  const gazePct = Math.round(session.nonverbal_coaching.gaze_rate * 100);
  const postureLogs = session.nonverbal_coaching.posture_log;
  const posturePct =
    postureLogs.length === 0
      ? 70
      : Math.round((postureLogs.filter((p) => p.is_ok).length / postureLogs.length) * 100);

  const wpmOk = wpm >= 250 && wpm <= 350;
  const wpmCard = wpm === 0 ? 'metric-card' : wpmOk ? 'metric-card good' : 'metric-card warn';
  const fillerCard =
    fillers >= 12 ? 'metric-card alert' : fillers >= 6 ? 'metric-card warn' : 'metric-card good';
  const gazeCard = gazePct >= 65 ? 'metric-card good' : gazePct >= 45 ? 'metric-card warn' : 'metric-card alert';
  const postureCard =
    posturePct >= 70 ? 'metric-card good' : posturePct >= 50 ? 'metric-card warn' : 'metric-card alert';

  const dynamismLog = session.nonverbal_coaching.dynamism_log;
  const lastDynamism = dynamismLog.length > 0 ? dynamismLog[dynamismLog.length - 1].level : 'natural';
  const dynamismLabel = lastDynamism === 'stiff' ? '⚠ Stiff' : lastDynamism === 'restless' ? '⚠ Restless' : '✓ Natural';
  const dynamismOk = lastDynamism === 'natural';

  const wpmProg = Math.min(100, wpm === 0 ? 8 : (wpm / 400) * 100);
  const fillerProg = Math.min(100, fillers * 8);
  const gazeProg = gazePct;
  const postureProg = posturePct;

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        v.onloadeddata = () => startPoseTracking(v);
        setCamOn(true);
      }
    } catch {
      setCamOn(false);
    }
  };

  const endSession = () => {
    stopPoseTracking();
    const s = Math.round((Date.now() - presentingStartRef.current) / 1000);
    useSessionStore.setState((st) => ({
      session: {
        ...st.session,
        speech_coaching: { ...st.session.speech_coaching, total_duration_sec: s },
      },
    }));

    const { session_id, user_id, speech_coaching } = useSessionStore.getState().session;
    void saveTranscriptToBlob(
      session_id,
      user_id,
      speech_coaching.transcript_log,
      s,
    );

    transition('POST_QA');
  };

  const tickerItems = [
    `🎙 Speech Rate ${wpm || '—'} (syll/min) · target 250–350`,
    `👁 Eye contact ${gazePct}%`,
    `⚠ Fillers ${fillers} times`,
    `🧍 Posture stability ${posturePct} pts`,
  ];

  return (
    <div id="screen-live" className="point-screen">
      <div className={`coaching-alert${alertUi ? ' visible' : ''}`}>
        {alertUi && (
          <>
            <div className="ca-header">
              <span className="ca-icon">⚡</span>
              <span className="ca-type" style={{ color: alertUi.color }}>
                {alertUi.typeLabel}
              </span>
            </div>
            <div className="ca-text">{alertUi.msg}</div>
          </>
        )}
      </div>

      <div className="live-shell">
        <div className="live-topbar">
          <div className="live-logo" aria-label="Point">
            <AnimatedPointLogo />
          </div>
          <div className="rec-indicator">
            <div className="rec-dot" />
            <div className="rec-text">LIVE SESSION</div>
          </div>
          <div className="live-timer">{formatMmSs(sec)}</div>
          <div className="live-actions">
            <button type="button" className="btn-end" onClick={endSession}>
              End Session ■
            </button>
          </div>
        </div>

        <div className="live-main">
          <div className="camera-area">
            <video
              ref={videoRef}
              className={`camera-feed${camOn ? '' : ' hidden'}`}
              autoPlay
              muted
              playsInline
            />
            {!camOn && (
              <div className="cam-placeholder">
                <div className="cam-icon" aria-hidden="true">📹</div>
                <div className="cam-label">Camera is optional · Voice coaching works with mic only</div>
                <div className="cam-action">
                  <button type="button" className="btn-primary btn-cam" onClick={startCamera}>
                    Turn on Camera
                  </button>
                </div>
              </div>
            )}
            <div className="scan-line" />
            <div className="corner-tl" />
            <div className="corner-tr" />
            <div className="corner-bl" />
            <div className="corner-br" />
            <div className="tracking-dot tracking-dot-left" />
            <div className="tracking-dot tracking-dot-right" />

            <div className="cam-overlays">
              <div className="cam-metric">
                <div className="cm-label">Speech Rate</div>
                <div className={`cm-value ${wpmOk || wpm === 0 ? 'good' : 'warn'}`}>
                  {wpm || '—'}{' '}
                  <span className="cm-unit">syll/min</span>
                </div>
              </div>
              <div className="cam-metric">
                <div className="cm-label">Voice</div>
                <div className="wave-bars">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="wave-bar" />
                  ))}
                </div>
              </div>
              <div className="cam-metric">
                <div className="cm-label">Gaze</div>
                <div className={`cm-value ${gazePct >= 55 ? 'good' : 'warn'}`}>
                  {gazePct >= 55 ? 'Front ✓' : 'Off'}
                </div>
              </div>
              <div className="cam-metric">
                <div className="cm-label">Posture</div>
                <div className={`cm-value ${posturePct >= 60 ? 'good' : 'warn'}`}>
                  {posturePct >= 60 ? 'Stable' : '⚠ Check'}
                </div>
              </div>
              <div className="cam-metric">
                <div className="cm-label">Movement</div>
                <div className={`cm-value ${dynamismOk ? 'good' : 'warn'}`}>
                  {dynamismLabel}
                </div>
              </div>
            </div>
          </div>

          <div className="coaching-panel">
            <div className="cp-header">
              <div className="cp-title">Live Coaching</div>
              <div className="cp-mode-toggle">
                <button
                  type="button"
                  className={`mode-btn${coachVisual ? ' active' : ''}`}
                  title="Overlay alerts only"
                  onClick={() => setCoachVisual(true)}
                >
                  Visual
                </button>
                <button
                  type="button"
                  className={`mode-btn${!coachVisual ? ' active' : ''}${!coachVisual && isSpeaking ? ' speaking' : ''}`}
                  title="OpenAI TTS + 자동재생 허용을 위해 이 버튼을 한 번 눌러 주세요"
                  onClick={() => {
                    primeFeedbackAudio();
                    setCoachVisual(false);
                  }}
                >
                  Voice{!coachVisual && isSpeaking && <span className="speaking-dot" aria-label="재생 중" />}
                </button>
              </div>
            </div>

            <div className="metrics-grid">
              <div className={wpmCard}>
                <div className="mc-label">🎙 Speech Rate</div>
                <div className="mc-val">{wpm || '—'}</div>
                <div className="mc-sub">syll/min · target 250–350</div>
                <div className="prog-bar">
                  <div
                    className="prog-fill"
                    style={{
                      width: `${wpmProg}%`,
                      background: wpmOk || wpm === 0 ? 'var(--green)' : 'var(--amber)',
                    }}
                  />
                </div>
              </div>
              <div className={fillerCard}>
                <div className="mc-label">😶 Fillers</div>
                <div className="mc-val">{fillers}</div>
                <div className="mc-sub">count · cumulative</div>
                <div className="prog-bar">
                  <div
                    className="prog-fill"
                    style={{
                      width: `${fillerProg}%`,
                      background: fillers >= 10 ? 'var(--red)' : 'var(--amber)',
                    }}
                  />
                </div>
              </div>
              <div className={gazeCard}>
                <div className="mc-label">👁 Eye Contact</div>
                <div className="mc-val">{gazePct}</div>
                <div className="mc-sub">pts · gaze rate</div>
                <div className="prog-bar">
                  <div
                    className="prog-fill"
                    style={{ width: `${gazeProg}%`, background: 'var(--green)' }}
                  />
                </div>
              </div>
              <div className={postureCard}>
                <div className="mc-label">🧍 Posture</div>
                <div className="mc-val">{posturePct}</div>
                <div className="mc-sub">pts · stability</div>
                <div className="prog-bar">
                  <div
                    className="prog-fill"
                    style={{ width: `${postureProg}%`, background: 'var(--amber)' }}
                  />
                </div>
              </div>
            </div>

            <div className="feedback-feed" ref={feedRef}>
              <div className="fb-item type-info">
                <div className="fb-header">
                  <span className="fb-cat cat-content">CONTENT</span>
                  <span className="fb-time">{formatMmSs(0)}</span>
                </div>
                <div className="fb-text">Presentation started. AI coaching is active.</div>
              </div>
              {feed.map((item) => {
                const { cls, label } = sourceToCat(item.source);
                const t = new Date(item.createdAt);
                const time = `${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
                return (
                  <div key={item.id} className={`fb-item ${levelToFeedClass(item.level)}`}>
                    <div className="fb-header">
                      <span className={`fb-cat ${cls}`}>{label}</span>
                      <span className="fb-time">{time}</span>
                    </div>
                    <div className="fb-text">{item.msg}</div>
                  </div>
                );
              })}
            </div>

            <div className="nonverbal-panel" aria-label="Nonverbal summary metrics">
              <div className="nv-title">Nonverbal Summary</div>
              <div className="nv-row">
                <span className="nv-label">Eye Contact</span>
                <div className="nv-bar-wrap">
                  <div className="nv-bar-fill nv-fill-green" style={{ width: `${gazePct}%` }} />
                </div>
                <span className="nv-score nv-score-green">{gazePct}</span>
              </div>
              <div className="nv-row">
                <span className="nv-label">Posture Stability</span>
                <div className="nv-bar-wrap">
                  <div className="nv-bar-fill nv-fill-amber" style={{ width: `${posturePct}%` }} />
                </div>
                <span className="nv-score nv-score-amber">{posturePct}</span>
              </div>
              <div className="nv-row">
                <span className="nv-label">Gestures (excess events)</span>
                <div className="nv-bar-wrap">
                  <div
                    className="nv-bar-fill nv-fill-violet"
                    style={{ width: `${Math.min(100, session.nonverbal_coaching.gesture_log.length * 5)}%` }}
                  />
                </div>
                <span className="nv-score nv-score-violet">
                  {session.nonverbal_coaching.gesture_log.length}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="live-ticker">
          <div className="ticker-label">LIVE AI</div>
          <div className="ticker-track">
            <div className="ticker-inner">
              {[...tickerItems, ...tickerItems].map((text, i) => (
                <span key={i} className="ticker-item">
                  <span className="t-accent">{text}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
