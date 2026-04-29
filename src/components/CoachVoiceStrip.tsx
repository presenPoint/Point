import { COACH_TTS_VOICE_OPTIONS } from '../lib/coachTtsVoice';
import { useSessionStore } from '../store/sessionStore';

export function CoachVoiceStrip() {
  const value = useSessionStore((s) => s.coachTtsVoiceOverride);
  const setVoice = useSessionStore((s) => s.setCoachTtsVoiceOverride);

  return (
    <div className="coach-voice-strip" aria-label="Coach narration voice">
      <div className="coach-voice-strip-head">
        <span className="coach-voice-strip-label">Narration voice (TTS)</span>
        <span className="coach-voice-strip-hint">Pre-quiz, Q&amp;A, live coach — overrides persona default when set.</span>
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
