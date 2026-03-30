import { useEffect, useRef, useState } from 'react';
import { feedbackQueue } from '../agents';
import { useLivePresenting } from '../hooks/useLivePresenting';
import { useSessionStore } from '../store/sessionStore';
import type { FeedbackItem, FeedbackLevel } from '../types/session';

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
  const { presentingStartRef } = useLivePresenting();
  const transition = useSessionStore((s) => s.transition);
  const session = useSessionStore((s) => s.session);
  const live = useSessionStore((s) => s.livePresentation);

  const [sec, setSec] = useState(0);
  const [feed, setFeed] = useState<FeedbackItem[]>([]);
  const [coachVisual, setCoachVisual] = useState(true);
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
      }
    };
    sync();
    return feedbackQueue.subscribe(sync);
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
        setCamOn(true);
      }
    } catch {
      setCamOn(false);
    }
  };

  const endSession = () => {
    const s = Math.round((Date.now() - presentingStartRef.current) / 1000);
    useSessionStore.setState((st) => ({
      session: {
        ...st.session,
        speech_coaching: { ...st.session.speech_coaching, total_duration_sec: s },
      },
    }));
    transition('POST_QA');
  };

  const tickerItems = [
    `🎙 말 속도 ${wpm || '—'} (음절/분) · 권장 250–350`,
    `👁 시선 응시율 ${gazePct}%`,
    `⚠ 추임새 ${fillers}회`,
    `🧍 자세 안정 ${posturePct}점`,
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
          <div className="live-logo">Point</div>
          <div className="rec-indicator">
            <div className="rec-dot" />
            <div className="rec-text">LIVE SESSION</div>
          </div>
          <div className="live-timer">{formatMmSs(sec)}</div>
          <div className="live-actions">
            <button type="button" className="btn-sm" onClick={() => setCoachVisual((v) => !v)}>
              🔔 {coachVisual ? '시각' : '알림'} 모드
            </button>
            <button type="button" className="btn-end" onClick={endSession}>
              발표 종료 ■
            </button>
          </div>
        </div>

        <div className="live-main">
          <div className="camera-area">
            <video
              ref={videoRef}
              className="camera-feed"
              style={{ display: camOn ? 'block' : 'none' }}
              autoPlay
              muted
              playsInline
            />
            {!camOn && (
              <div className="cam-placeholder">
                <div className="cam-icon">📹</div>
                <div className="cam-label">카메라는 선택입니다 · 음성 코칭은 마이크만으로 동작</div>
                <div style={{ marginTop: 16 }}>
                  <button type="button" className="btn-primary" style={{ fontSize: 12, padding: '8px 20px' }} onClick={startCamera}>
                    카메라 켜기
                  </button>
                </div>
              </div>
            )}
            <div className="scan-line" />
            <div className="corner-tl" />
            <div className="corner-tr" />
            <div className="corner-bl" />
            <div className="corner-br" />
            <div className="tracking-dot" style={{ top: '32%', left: '44%' }} />
            <div className="tracking-dot" style={{ top: '32%', left: '56%' }} />

            <div className="cam-overlays">
              <div className="cam-metric">
                <div className="cm-label">말 속도</div>
                <div className={`cm-value ${wpmOk || wpm === 0 ? 'good' : 'warn'}`}>
                  {wpm || '—'}{' '}
                  <span style={{ fontSize: 10, opacity: 0.7 }}>음절/분</span>
                </div>
              </div>
              <div className="cam-metric">
                <div className="cm-label">음성</div>
                <div className="wave-bars">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="wave-bar" />
                  ))}
                </div>
              </div>
              <div className="cam-metric">
                <div className="cm-label">시선</div>
                <div className={`cm-value ${gazePct >= 55 ? 'good' : 'warn'}`}>
                  {gazePct >= 55 ? '정면 ✓' : '이탈'}
                </div>
              </div>
              <div className="cam-metric">
                <div className="cm-label">자세</div>
                <div className={`cm-value ${posturePct >= 60 ? 'good' : 'warn'}`}>
                  {posturePct >= 60 ? '안정' : '⚠ 점검'}
                </div>
              </div>
            </div>
          </div>

          <div className="coaching-panel">
            <div className="cp-header">
              <div className="cp-title">실시간 코칭</div>
              <div className="cp-mode-toggle">
                <button
                  type="button"
                  className={`mode-btn${coachVisual ? ' active' : ''}`}
                  onClick={() => setCoachVisual(true)}
                >
                  시각
                </button>
                <button
                  type="button"
                  className={`mode-btn${!coachVisual ? ' active' : ''}`}
                  onClick={() => setCoachVisual(false)}
                >
                  음성
                </button>
              </div>
            </div>

            <div className="metrics-grid">
              <div className={wpmCard}>
                <div className="mc-label">🎙 말 속도</div>
                <div className="mc-val">{wpm || '—'}</div>
                <div className="mc-sub">음절/분 · 권장 250–350</div>
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
                <div className="mc-label">😶 추임새</div>
                <div className="mc-val">{fillers}</div>
                <div className="mc-sub">회 · 누적</div>
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
                <div className="mc-label">👁 시선처리</div>
                <div className="mc-val">{gazePct}</div>
                <div className="mc-sub">점 · 응시율</div>
                <div className="prog-bar">
                  <div
                    className="prog-fill"
                    style={{ width: `${gazeProg}%`, background: 'var(--green)' }}
                  />
                </div>
              </div>
              <div className={postureCard}>
                <div className="mc-label">🧍 자세</div>
                <div className="mc-val">{posturePct}</div>
                <div className="mc-sub">점 · 안정성</div>
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
                <div className="fb-text">발표가 시작되었습니다. AI 코칭이 실시간으로 작동 중입니다.</div>
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

            <div className="nonverbal-panel">
              <div className="nv-title">비언어 종합</div>
              <div className="nv-row">
                <span className="nv-label">시선 응시</span>
                <div className="nv-bar-wrap">
                  <div
                    className="nv-bar-fill"
                    style={{ width: `${gazePct}%`, background: 'var(--green)' }}
                  />
                </div>
                <span className="nv-score" style={{ color: 'var(--green)' }}>
                  {gazePct}
                </span>
              </div>
              <div className="nv-row">
                <span className="nv-label">자세 안정</span>
                <div className="nv-bar-wrap">
                  <div
                    className="nv-bar-fill"
                    style={{ width: `${posturePct}%`, background: 'var(--amber)' }}
                  />
                </div>
                <span className="nv-score" style={{ color: 'var(--amber)' }}>
                  {posturePct}
                </span>
              </div>
              <div className="nv-row">
                <span className="nv-label">제스처(과다 이벤트)</span>
                <div className="nv-bar-wrap">
                  <div
                    className="nv-bar-fill"
                    style={{
                      width: `${Math.min(100, session.nonverbal_coaching.gesture_log.length * 5)}%`,
                      background: 'var(--violet)',
                    }}
                  />
                </div>
                <span className="nv-score" style={{ color: 'var(--violet)' }}>
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
