import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSessionStore, loadSessionHistory, type SessionHistoryItem, type PersonaType } from '../store/sessionStore';
import { PERSONA_LIST, PERSONAS } from '../constants/personas';
import { PersonaInfoModal } from './PersonaInfoModal';
import type { ReactNode } from 'react';

// startPersonaStyleQuiz / startWithDefaultCoaching 는 App.tsx 에서 props로 전달됩니다.

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

interface HomeScreenProps {
  userBar?: ReactNode;
  userId?: string;
  onBack?: () => void;
  startPersonaStyleQuiz: () => void;
  startWithDefaultCoaching: () => void;
}

export function HomeScreen({ userBar, userId, onBack, startPersonaStyleQuiz, startWithDefaultCoaching }: HomeScreenProps) {
  const setAppStarted = useSessionStore((s) => s.setAppStarted);
  const setPersona   = useSessionStore((s) => s.setPersona);
  const [detailPersonaId, setDetailPersonaId] = useState<PersonaType | null>(null);
  const personaScrollRef = useRef<HTMLDivElement>(null);

  /** 카드 순서: Jobs — Brené — Obama. 첫 진입 시 가운데(Brené)가 스크롤 영역 중앙에 오도록 */
  useLayoutEffect(() => {
    const scroll = personaScrollRef.current;
    if (!scroll) return;
    const card = scroll.querySelector<HTMLElement>('[data-persona-card="connector"]');
    if (!card) return;
    const target =
      card.offsetLeft - scroll.clientWidth / 2 + card.offsetWidth / 2;
    scroll.scrollLeft = Math.max(0, Math.min(target, scroll.scrollWidth - scroll.clientWidth));
  }, []);

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
      {/* 코치 선택 + 진행 기록을 한 장의 노트 시트로 (상단 계정 바 포함) */}
      <div className="home-notebook-sheet">
        <div className="coach-select-topbar coach-select-topbar--in-sheet">
          {onBack && (
            <button type="button" className="coach-select-back" onClick={onBack} aria-label="Back to landing">
              ← Back
            </button>
          )}
          <div className="coach-select-topbar-right">{userBar}</div>
        </div>

        <section className="home-persona-section home-persona-section--page" aria-labelledby="home-persona-heading">
          <div className="home-persona-section-inner">
            <p className="home-persona-eyebrow">Coaching styles</p>
            <h1 id="home-persona-heading" className="home-persona-heading">
              Pick your coach
            </h1>
            <p className="home-persona-lead">
              Each coach brings a different energy. Choose the style that fits your presentation.
            </p>
            <div className="coach-select-cta-row" role="group" aria-label="빠른 시작 옵션">
              <button type="button" className="home-cta-primary" onClick={startPersonaStyleQuiz}>
                Find My Match
                <span className="home-cta-sub">Take the quiz · 30 sec</span>
              </button>
              <button type="button" className="home-cta-secondary" onClick={startWithDefaultCoaching}>
                Quick Start
                <span className="home-cta-sub">Skip to default coaching</span>
              </button>
            </div>
          </div>

          <div className="home-persona-strip">
            <div className="home-persona-scroll" ref={personaScrollRef}>
              <div className="home-persona-scroll-inner" role="list" aria-label="Coach style cards">
                {PERSONA_LIST.map((p) => (
                  <article
                    key={p.id}
                    className="home-persona-card home-persona-card--compact"
                    role="listitem"
                    data-persona-card={p.id}
                  >
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
                          {p.presentationInfo.archetype}
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
