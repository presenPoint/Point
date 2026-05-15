import { COACH_TTS_VOICE_OPTIONS } from '../lib/coachTtsVoice';
import { useSessionStore } from '../store/sessionStore';
import { useT } from '../hooks/useT';

export function CoachVoiceStrip() {
  const t = useT();
  const value = useSessionStore((s) => s.coachTtsVoiceOverride);
  const setVoice = useSessionStore((s) => s.setCoachTtsVoiceOverride);

  return (
    <div className="coach-voice-strip" aria-label={t('persona.coachVoice.aria')}>
      <div className="coach-voice-strip-head">
        <span className="coach-voice-strip-label">{t('persona.coachVoice.label')}</span>
        <span className="coach-voice-strip-hint">{t('persona.coachVoice.hint')}</span>
      </div>
      <select
        className="coach-voice-select"
        value={value}
        onChange={(e) => setVoice(e.target.value)}
      >
        {COACH_TTS_VOICE_OPTIONS.map((o) => (
          <option key={o.id || 'default'} value={o.id}>
            {o.label}
            {o.hint ? ` — ${o.hint}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
