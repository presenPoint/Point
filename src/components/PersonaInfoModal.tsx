import { useEffect, useId, useRef } from 'react';
import type { Persona } from '../constants/personas';

type Props = {
  persona: Persona;
  onClose: () => void;
  onStart: () => void;
};

function gazeLabel(s: Persona['config']['gazeSensitivity']): string {
  if (s === 'high') return 'High — eye contact weighted heavily in coaching';
  if (s === 'mid') return 'Medium — balanced gaze expectations';
  return 'Low — gaze less central to this style benchmark';
}

export function PersonaInfoModal({ persona: p, onClose, onStart }: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const info = p.presentationInfo;

  return (
    <div className="persona-modal-root" role="presentation">
      <button type="button" className="persona-modal-backdrop" aria-label="Close" onClick={onClose} />
      <div
        ref={panelRef}
        className="persona-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="persona-modal-header">
          <div className="persona-modal-photo">
            <img src={p.cardImage} alt="" loading="eager" decoding="async" />
          </div>
          <div className="persona-modal-header-text">
            <p className="persona-modal-eyebrow">{info.archetype}</p>
            <h2 id={titleId} className="persona-modal-title">
              {p.name}
            </h2>
            <p className="persona-modal-domain">{info.domainFit}</p>
          </div>
          <button type="button" className="persona-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="persona-modal-body">
          <p className="persona-modal-summary">{info.summary}</p>

          <h3 className="persona-modal-subhead">Presentation habits</h3>
          <ul className="persona-modal-list">
            {info.principles.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>

          <h3 className="persona-modal-subhead">How Point coaches this style</h3>
          <dl className="persona-modal-stats">
            <div>
              <dt>Speaking pace</dt>
              <dd>
                {p.config.wpmRange[0]}–{p.config.wpmRange[1]} WPM
              </dd>
            </div>
            <div>
              <dt>Gaze sensitivity</dt>
              <dd>{gazeLabel(p.config.gazeSensitivity)}</dd>
            </div>
            <div>
              <dt>Gesture intensity</dt>
              <dd>{Math.round(p.config.gestureIntensity * 100)}% (model benchmark)</dd>
            </div>
            <div>
              <dt>Feedback tone</dt>
              <dd className="persona-modal-cap">{p.config.feedbackTone}</dd>
            </div>
          </dl>
        </div>

        <div className="persona-modal-actions">
          <button type="button" className="btn-persona-modal-secondary" onClick={onClose}>
            Back
          </button>
          <button type="button" className="btn-persona-modal-primary" onClick={onStart}>
            Start with this coach
          </button>
        </div>
      </div>
    </div>
  );
}
