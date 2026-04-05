import { useEffect, useState } from 'react';
import { useSessionStore, loadSessionHistory, type SessionHistoryItem } from '../store/sessionStore';
import type { ReactNode } from 'react';

function HistorySection({ userId }: { userId: string }) {
  const [history, setHistory] = useState<SessionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessionHistory(userId).then((data) => {
      setHistory(data);
      setLoading(false);
    });
  }, [userId]);

  if (loading) return <div className="history-loading">Loading past sessions…</div>;
  if (history.length === 0) return null;

  return (
    <div className="history-section">
      <h2 className="history-title">Your Progress</h2>
      <div className="history-list">
        {history.map((s) => (
          <div key={s.session_id} className="history-card">
            <div className="history-card-top">
              <span className="history-date">
                {new Date(s.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <span className="history-duration">
                {Math.round(s.total_duration_sec / 60)} min
              </span>
            </div>
            <div className="history-scores">
              <div className="history-score">
                <span className="hs-val">{s.composite_score}</span>
                <span className="hs-label">Overall</span>
              </div>
              <div className="history-score">
                <span className="hs-val">{s.speech_score}</span>
                <span className="hs-label">Speech</span>
              </div>
              <div className="history-score">
                <span className="hs-val">{s.nonverbal_score}</span>
                <span className="hs-label">Nonverbal</span>
              </div>
              <div className="history-score">
                <span className="hs-val">{s.qa_score}</span>
                <span className="hs-label">Q&A</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HomeScreen({ userBar, userId }: { userBar?: ReactNode; userId?: string }) {
  const setAppStarted = useSessionStore((s) => s.setAppStarted);

  return (
    <main id="screen-home" className="point-screen screen-home" role="main">
      {userBar}
      <div className="home-content">
        <h1 className="home-logo">Point</h1>
        <p className="home-tagline">AI helps you beat presentation anxiety</p>
        <p className="home-sub">
          Live voice &amp; nonverbal coaching · Pre-learn your material · AI Q&amp;A
          <br />
          Feedback in the moment—no need to rewatch the recording.
        </p>

        <ul className="home-features" aria-label="Key features">
          <li className="hf-chip">
            <span className="dot dot-cyan" aria-hidden="true" />
            Real-time nonverbal coaching
          </li>
          <li className="hf-chip">
            <span className="dot dot-violet" aria-hidden="true" />
            Pre-learn your presentation
          </li>
          <li className="hf-chip">
            <span className="dot dot-green" aria-hidden="true" />
            AI Q&amp;A
          </li>
        </ul>

        <button type="button" className="btn-start" onClick={() => setAppStarted(true)}>
          Start presenting →
        </button>

        {userId && <HistorySection userId={userId} />}
      </div>
    </main>
  );
}
