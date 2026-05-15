import type { ReactNode } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { useT } from '../hooks/useT';
import { LanguageSwitcher } from './LanguageSwitcher';

interface Props {
  userBar?: ReactNode;
  onBack?: () => void;
  onSelectWithMaterials: () => void;
}

export function PresentationModeSelect({ userBar, onBack, onSelectWithMaterials }: Props) {
  const t = useT();
  const startPresenting = useSessionStore((s) => s.startPresenting);

  const handleDirect = () => {
    void startPresenting();
  };

  return (
    <main id="screen-mode-select" className="point-screen screen-home" role="main">
      <div className="home-notebook-sheet">
        <div className="coach-select-topbar coach-select-topbar--in-sheet">
          {onBack && (
            <button type="button" className="coach-select-back" onClick={onBack} aria-label={t('mode.backAria')}>
              {t('mode.back')}
            </button>
          )}
          <div className="coach-select-topbar-right">
            <LanguageSwitcher className="lang-switcher--topnav" />
            {userBar}
          </div>
        </div>

        <section className="mode-select-section home-persona-section--page" aria-labelledby="mode-select-heading">
          <div className="home-persona-section-inner mode-select-inner">
            <p className="home-persona-eyebrow">{t('mode.eyebrow')}</p>
            <h1 id="mode-select-heading" className="home-persona-heading">
              {t('mode.title')}
            </h1>
            <p className="home-persona-lead">
              {t('mode.lead')}
            </p>

            <div className="mode-select-cards">
              <button
                type="button"
                className="mode-select-card mode-select-card--primary"
                onClick={onSelectWithMaterials}
              >
                <span className="mode-select-card-icon" aria-hidden="true">📄</span>
                <span className="mode-select-card-title">{t('mode.card1Title')}</span>
                <span className="mode-select-card-desc">
                  {t('mode.card1Line1')}
                  <br />
                  {t('mode.card1Line2')}
                </span>
              </button>

              <button
                type="button"
                className="mode-select-card mode-select-card--secondary"
                onClick={handleDirect}
              >
                <span className="mode-select-card-icon" aria-hidden="true">🎙</span>
                <span className="mode-select-card-title">{t('mode.card2Title')}</span>
                <span className="mode-select-card-desc">
                  {t('mode.card2Line1')}
                  <br />
                  {t('mode.card2Line2')}
                </span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
