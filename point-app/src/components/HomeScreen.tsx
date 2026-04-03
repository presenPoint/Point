import { useSessionStore } from '../store/sessionStore';
import type { ReactNode } from 'react';

export function HomeScreen({ userBar }: { userBar?: ReactNode }) {
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
      </div>
    </main>
  );
}
