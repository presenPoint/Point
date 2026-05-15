import { useState } from 'react';
import { primeFeedbackAudio } from '../lib/feedbackTts';
import { speakCoachGuideDemo, stopCoachQuestionSpeech, type CoachGuideDemoId } from '../lib/coachQuestionTts';
import { useSessionStore } from '../store/sessionStore';

export function CoachingGuideStrip() {
  const selectedPersona = useSessionStore((s) => s.selectedPersona);
  const [demoBusy, setDemoBusy] = useState<CoachGuideDemoId | null>(null);

  const playDemo = (id: CoachGuideDemoId) => {
    primeFeedbackAudio();
    stopCoachQuestionSpeech();
    setDemoBusy(id);
    void speakCoachGuideDemo(id, selectedPersona).finally(() => setDemoBusy(null));
  };

  return (
    <section className="coaching-guide-strip" aria-label="Speaking and presence tips">
      <div className="cg-strip-head">
        <span className="cg-strip-title">Guides &amp; demos</span>
        <span className="cg-strip-sub">Listen, then repeat out loud — no scoring yet.</span>
      </div>

      <div className="cg-card-grid">
        <div className="cg-card">
          <div className="cg-card-label">Formal open</div>
          <p className="cg-card-quote">
            &ldquo;Good afternoon. I have three brief points—first the outcome, then proof, then the ask.&rdquo;
          </p>
          <p className="cg-card-tip">Boardroom-style English: calm pacing, full sentences, no filler.</p>
          <button
            type="button"
            className="btn-sm cg-card-btn"
            disabled={demoBusy !== null}
            onClick={() => playDemo('formal_en')}
          >
            {demoBusy === 'formal_en' ? 'Playing…' : '▶ Hear formal (EN)'}
          </button>
        </div>
        <div className="cg-card">
          <div className="cg-card-label">Eye line</div>
          <p className="cg-card-tip">
            Sweep the room in a slow &ldquo;W&rdquo; — land on one face per thought, not the screen corner.
          </p>
          <div className="cg-card-illus" aria-hidden>
            👁 · · · 👁
          </div>
        </div>
        <div className="cg-card">
          <div className="cg-card-label">Hands</div>
          <p className="cg-card-tip">
            Open palms at chest height for emphasis; return to neutral &ldquo;home&rdquo; between beats — avoid
            fidgeting.
          </p>
          <div className="cg-card-illus" aria-hidden>
            🤲 → ✋
          </div>
        </div>
      </div>

      <div className="cg-demo-row">
        <span className="cg-demo-label">Pacing demo (EN)</span>
        <button
          type="button"
          className="btn-sm"
          disabled={demoBusy !== null}
          onClick={() => playDemo('steady_en')}
        >
          {demoBusy === 'steady_en' ? 'Playing…' : '▶ Hear steady pace'}
        </button>
      </div>
    </section>
  );
}
