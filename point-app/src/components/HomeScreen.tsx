import { useEffect, useState } from 'react';
import { useSessionStore, loadSessionHistory, type SessionHistoryItem, type PersonaType } from '../store/sessionStore';
import { PERSONA_LIST, PERSONAS } from '../constants/personas';
import { PersonaInfoModal } from './PersonaInfoModal';
import type { ReactNode } from 'react';

function coachInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0].charAt(0);
    const b = parts[parts.length - 1].charAt(0);
    return (a + b).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function PersonaCardPhoto({ name, src }: { name: string; src: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="hpc-photo-wrap">
      {failed ? (
        <div className="hpc-photo-fallback" aria-hidden="true">
          <span className="hpc-photo-fallback-initials">{coachInitials(name)}</span>
        </div>
      ) : (
        <img
          className="hpc-photo"
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

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
  const setPersona = useSessionStore((s) => s.setPersona);
  const startPersonaStyleQuiz = useSessionStore((s) => s.startPersonaStyleQuiz);
  const startWithDefaultCoaching = useSessionStore((s) => s.startWithDefaultCoaching);
  const [detailPersonaId, setDetailPersonaId] = useState<PersonaType | null>(null);

  const selectPersonaAndStart = (id: PersonaType) => {
    setPersona(id);
    setAppStarted(true);
  };

  const closePersonaDetail = () => setDetailPersonaId(null);

  const startFromDetail = () => {
    if (!detailPersonaId) return;
    setDetailPersonaId(null);
    selectPersonaAndStart(detailPersonaId);
  };

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

        <div className="home-cta-row" role="group" aria-label="시작 옵션">
          <button type="button" className="home-cta-primary" onClick={startPersonaStyleQuiz}>
            Suggested match
            <span className="home-cta-sub">Solve the Quiz</span>
          </button>
          <button type="button" className="home-cta-secondary" onClick={startWithDefaultCoaching}>
            quick start
            <span className="home-cta-sub">Default scoring</span>
          </button>
        </div>
      </div>

      <section className="home-persona-section" aria-labelledby="home-persona-heading">
        <div className="home-persona-section-inner">
          <p className="home-persona-eyebrow">Coach profiles</p>
          <h2 id="home-persona-heading" className="home-persona-heading">
            Browse styles
          </h2>
          <p className="home-persona-lead">
            Tap a card to read how they present. Use <strong>Select</strong> to jump straight into a session with that style.
          </p>
        </div>
        <div className="home-persona-strip">
          <div className="home-persona-scroll">
            <div className="home-persona-scroll-inner" role="list" aria-label="Coach style cards">
              {PERSONA_LIST.map((p) => (
                <article key={p.id} className="home-persona-card home-persona-card--compact" role="listitem">
                  <button
                    type="button"
                    className="hpc-card-tap"
                    onClick={() => setDetailPersonaId(p.id)}
                    aria-label={`View ${p.name} presentation style`}
                  >
                    <PersonaCardPhoto name={p.name} src={p.cardImage} />
                    <div className="hpc-card-body hpc-card-body--compact">
                      <h3 className="hpc-name hpc-name--compact">{p.name}</h3>
                      <p className="hpc-desc hpc-desc--compact">{p.description}</p>
                      <p className="hpc-meta-inline">
                        {p.config.wpmRange[0]}–{p.config.wpmRange[1]} WPM ·{' '}
                        <span className="hpc-meta-tone">{p.config.feedbackTone}</span>
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="btn-persona-pick btn-persona-pick--compact"
                    onClick={() => selectPersonaAndStart(p.id)}
                  >
                    Select
                  </button>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="home-content home-content--after-cards">
        {userId && <HistorySection userId={userId} />}
      </div>

      {detailPersonaId && (
        <PersonaInfoModal
          persona={PERSONAS[detailPersonaId]}
          onClose={closePersonaDetail}
          onStart={startFromDetail}
        />
      )}
    </main>
  );
}
