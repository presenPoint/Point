import { useEffect, useId, useRef } from 'react';
import type { Persona } from '../constants/personas';
import { PERSONA_FEEDBACK_TONE_KEYS, PERSONA_UI_KEYS } from '../constants/personaUiKeys';
import { useT } from '../hooks/useT';
import { getPersonaPaceRange } from '../lib/speechRate';
import { useLocaleStore } from '../store/localeStore';
import type { MessageKey } from '../locales/messages';

type Props = {
  persona: Persona;
  onClose: () => void;
  onStart: () => void;
};

function gazeMessageKey(s: Persona['config']['gazeSensitivity']): MessageKey {
  if (s === 'high') return 'persona.gaze.high';
  if (s === 'mid') return 'persona.gaze.mid';
  return 'persona.gaze.low';
}

export function PersonaInfoModal({ persona: p, onClose, onStart }: Props) {
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const pace = getPersonaPaceRange(p.config, locale);
  const paceUnit = pace.unit === 'spm' ? t('persona.modal.spmUnit') : t('persona.modal.wpmUnit');
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const ui = PERSONA_UI_KEYS[p.id];

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

  const displayName = t(ui.name);
  const toneKey = PERSONA_FEEDBACK_TONE_KEYS[p.config.feedbackTone] ?? 'persona.feedbackTone.encouraging';

  return (
    <div className="persona-modal-root" role="presentation">
      <button type="button" className="persona-modal-backdrop" aria-label={t('persona.modal.close')} onClick={onClose} />
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
            <p className="persona-modal-eyebrow">{t(ui.archetype)}</p>
            <h2 id={titleId} className="persona-modal-title">
              {displayName}
            </h2>
            <p className="persona-modal-domain">{t(ui.domainFit)}</p>
          </div>
          <button type="button" className="persona-modal-close" onClick={onClose} aria-label={t('persona.modal.close')}>
            ×
          </button>
        </div>

        <div className="persona-modal-body">
          <p className="persona-modal-summary">{t(ui.summary)}</p>

          <h3 className="persona-modal-subhead">{t('persona.modal.presentationHabits')}</h3>
          <ul className="persona-modal-list">
            {ui.principles.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>

          <h3 className="persona-modal-subhead">{t('persona.modal.howPointCoaches')}</h3>
          <dl className="persona-modal-stats">
            <div>
              <dt>{t('persona.modal.speakingPace')}</dt>
              <dd>
                {pace.min}–{pace.max} {paceUnit}
              </dd>
            </div>
            <div>
              <dt>{t('persona.modal.gazeSensitivity')}</dt>
              <dd>{t(gazeMessageKey(p.config.gazeSensitivity))}</dd>
            </div>
            <div>
              <dt>{t('persona.modal.gestureIntensity')}</dt>
              <dd>
                {Math.round(p.config.gestureIntensity * 100)}% {t('persona.modal.gestureBenchmark')}
              </dd>
            </div>
            <div>
              <dt>{t('persona.modal.feedbackTone')}</dt>
              <dd className="persona-modal-cap">{t(toneKey)}</dd>
            </div>
          </dl>
        </div>

        <div className="persona-modal-actions">
          <button type="button" className="btn-persona-modal-secondary" onClick={onClose}>
            {t('persona.modal.back')}
          </button>
          <button type="button" className="btn-persona-modal-primary" onClick={onStart}>
            {t('persona.modal.startWithCoach')}
          </button>
        </div>
      </div>
    </div>
  );
}
