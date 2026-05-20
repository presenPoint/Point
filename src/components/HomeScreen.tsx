import { useLayoutEffect, useRef, useState } from 'react';
import { useSessionStore, type PersonaType } from '../store/sessionStore';
import { PERSONA_LIST, PERSONAS } from '../constants/personas';
import { PERSONA_UI_KEYS } from '../constants/personaUiKeys';
import { PersonaInfoModal } from './PersonaInfoModal';
import { PointWordmark } from './PointWordmark';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useT } from '../hooks/useT';
import { AccountDeleteButton } from './AccountDeleteButton';

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


interface HomeScreenProps {
  userName?: string;
  userAvatar?: string;
  userId?: string;
  onBack?: () => void;
  onSignOut?: () => void;
  onAccountDeleted?: () => void;
  onShowDashboard?: () => void;
  onShowPricing?: () => void;
  startPersonaStyleQuiz: () => void;
  startWithDefaultCoaching: () => void;
}

export function HomeScreen({ userName, userAvatar, userId, onBack, onSignOut, onAccountDeleted, onShowDashboard, onShowPricing, startPersonaStyleQuiz, startWithDefaultCoaching }: HomeScreenProps) {
  const t = useT();
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
      {/* 코치 선택 + 진행 기록을 한 장의 노트 시트로 */}
      <div className="home-notebook-sheet">
        <nav className="home-topnav" aria-label={t('nav.mainNavigation')}>
          <div className="home-topnav-brand">
            <PointWordmark
              onHomeClick={onBack}
              ariaLabel={t('nav.pointBack')}
              className="home-topnav-wordmark"
            />
          </div>
          <div className="home-topnav-links">
            <LanguageSwitcher className="lang-switcher--topnav" />
            <button type="button" className="home-topnav-link" onClick={onShowPricing}>
              {t('nav.pricing')}
            </button>
            {userId && onShowDashboard && (
              <button type="button" className="home-topnav-link" onClick={onShowDashboard}>
                {t('nav.myProgress')}
              </button>
            )}
            <div className="home-topnav-user">
              {userAvatar && (
                <img
                  className="home-topnav-avatar"
                  src={userAvatar}
                  alt={userName ?? ''}
                  referrerPolicy="no-referrer"
                />
              )}
              {userName && <span className="home-topnav-username">{userName}</span>}
              {onSignOut && (
                <button type="button" className="home-topnav-signout" onClick={onSignOut}>
                  {t('nav.signOut')}
                </button>
              )}
              {onAccountDeleted && (
                <AccountDeleteButton className="home-topnav-delete" onDeleted={onAccountDeleted} />
              )}
            </div>
          </div>
        </nav>

        <section className="home-persona-section home-persona-section--page" aria-labelledby="home-persona-heading">
          <div className="home-persona-section-inner">
            <p className="home-persona-eyebrow">{t('home.eyebrow')}</p>
            <h1 id="home-persona-heading" className="home-persona-heading">
              {t('home.title')}
            </h1>
            <p className="home-persona-lead">{t('home.lead')}</p>
            <div className="coach-select-cta-row" role="group" aria-label={t('home.groupQuickStart')}>
              <button type="button" className="home-cta-primary" onClick={startPersonaStyleQuiz}>
                {t('home.ctaQuiz')}
                <span className="home-cta-sub">{t('home.ctaQuizSub')}</span>
              </button>
              <button type="button" className="home-cta-secondary" onClick={startWithDefaultCoaching}>
                {t('home.ctaQuick')}
                <span className="home-cta-sub">{t('home.ctaQuickSub')}</span>
              </button>
            </div>
          </div>

          <div className="home-persona-strip">
            <div className="home-persona-scroll" ref={personaScrollRef}>
              <div className="home-persona-scroll-inner" role="list" aria-label={t('home.coachCardsAria')}>
                {PERSONA_LIST.map((p) => {
                  const ui = PERSONA_UI_KEYS[p.id];
                  const displayName = t(ui.name);
                  return (
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
                      aria-label={t('persona.viewStyleAria', { name: displayName })}
                    >
                      <PersonaCardPhoto name={displayName} src={p.cardImage} />
                      <div className="hpc-card-body hpc-card-body--compact">
                        <h3 className="hpc-name hpc-name--compact">{displayName}</h3>
                        <p className="hpc-desc hpc-desc--compact">{t(ui.description)}</p>
                        <p className="hpc-meta-inline">
                          {t(ui.archetype)}
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      className="btn-persona-pick btn-persona-pick--compact"
                      onClick={() => selectPersonaAndStart(p.id)}
                    >
                      {t('home.selectCoach')}
                    </button>
                  </article>
                  );
                })}
              </div>
            </div>
          </div>

        </section>
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
