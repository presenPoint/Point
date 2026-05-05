import type { ReactNode } from 'react';
import { useSessionStore } from '../store/sessionStore';

interface Props {
  userBar?: ReactNode;
  onBack?: () => void;
  onSelectWithMaterials: () => void;
}

export function PresentationModeSelect({ userBar, onBack, onSelectWithMaterials }: Props) {
  const startPresenting = useSessionStore((s) => s.startPresenting);

  const handleDirect = () => {
    void startPresenting();
  };

  return (
    <main id="screen-mode-select" className="point-screen screen-home" role="main">
      <div className="home-notebook-sheet">
        <div className="coach-select-topbar coach-select-topbar--in-sheet">
          {onBack && (
            <button type="button" className="coach-select-back" onClick={onBack} aria-label="Back to coach selection">
              ← Back
            </button>
          )}
          <div className="coach-select-topbar-right">{userBar}</div>
        </div>

        <section className="mode-select-section home-persona-section--page" aria-labelledby="mode-select-heading">
          <div className="home-persona-section-inner mode-select-inner">
            <p className="home-persona-eyebrow">Presentation setup</p>
            <h1 id="mode-select-heading" className="home-persona-heading">
              How would you like to start?
            </h1>
            <p className="home-persona-lead">
              Upload your materials for AI-powered coaching, or jump straight into presenting.
            </p>

            <div className="mode-select-cards">
              <button
                type="button"
                className="mode-select-card mode-select-card--primary"
                onClick={onSelectWithMaterials}
              >
                <span className="mode-select-card-icon" aria-hidden="true">📄</span>
                <span className="mode-select-card-title">자료 업로드</span>
                <span className="mode-select-card-desc">슬라이드·스크립트를 업로드하고<br />AI 분석 및 사전 퀴즈를 진행합니다</span>
              </button>

              <button
                type="button"
                className="mode-select-card mode-select-card--secondary"
                onClick={handleDirect}
              >
                <span className="mode-select-card-icon" aria-hidden="true">🎙</span>
                <span className="mode-select-card-title">바로 발표 시작</span>
                <span className="mode-select-card-desc">자료 없이 바로 발표를 시작하고<br />실시간 코칭을 받습니다</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
