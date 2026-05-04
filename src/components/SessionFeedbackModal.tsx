import { useEffect, useId, useRef } from 'react';
import type { SessionHistoryItem } from '../store/sessionStore';
import type { ActionableFeedback, TimeMarker } from '../types/session';
import { ScoreRing } from './ScoreRing';

type Props = {
  session: SessionHistoryItem;
  onClose: () => void;
};

export function SessionFeedbackModal({ session: s, onClose }: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => { panelRef.current?.focus(); }, []);

  const date = new Date(s.started_at).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
  const durationMin = Math.round(s.total_duration_sec / 60);
  const improvements = (s.improvements ?? []) as (ActionableFeedback | string)[];

  return (
    <div className="sfm-root" role="presentation">
      <button type="button" className="sfm-backdrop" aria-label="Close" onClick={onClose} />
      <div
        ref={panelRef}
        className="sfm-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="sfm-header">
          <div>
            <h2 id={titleId} className="sfm-title">{date}</h2>
            <p className="sfm-meta">{durationMin} min presentation</p>
          </div>
          <button type="button" className="sfm-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="sfm-body">
          <div className="sfm-section-title">Scores</div>
          <div className="score-row sfm-score-row">
            <div className="score-circle">
              <ScoreRing value={s.speech_score} colorVar="var(--cyan)" />
              <div className="circle-label">Verbal<br />Coaching</div>
            </div>
            <div className="score-circle">
              <ScoreRing value={s.nonverbal_score} colorVar="var(--violet)" />
              <div className="circle-label">Nonverbal<br />Coaching</div>
            </div>
            <div className="score-circle">
              <ScoreRing value={s.qa_score} colorVar="var(--green)" />
              <div className="circle-label">Q&A<br />Delivery</div>
            </div>
            <div className="score-circle">
              <ScoreRing value={s.composite_score} colorVar="var(--amber)" />
              <div className="circle-label">Overall<br />Score</div>
            </div>
          </div>

          {s.strengths.length > 0 && (
            <>
              <div className="sfm-section-title">Strengths 👍</div>
              <div className="insight-list">
                {s.strengths.map((str, i) => (
                  <div key={i} className="insight-item positive">
                    <div className="insight-icon">✅</div>
                    <div className="insight-content">
                      <div className="insight-title">Point {i + 1}</div>
                      <div className="insight-desc">{str}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {improvements.length > 0 && (
            <>
              <div className="sfm-section-title">Actionable Coaching</div>
              <div className="insight-list">
                {improvements.map((item, i) => {
                  if (typeof item === 'string') {
                    return (
                      <div key={i} className="insight-item negative">
                        <div className="insight-icon">⚠️</div>
                        <div className="insight-content">
                          <div className="insight-title">Improvement {i + 1}</div>
                          <div className="insight-desc">{item}</div>
                        </div>
                      </div>
                    );
                  }
                  const fb = item as ActionableFeedback;
                  const markers = (fb as ActionableFeedback & { time_markers?: TimeMarker[] }).time_markers;
                  return (
                    <div key={i} className="coaching-card">
                      <div className="coaching-header">
                        <span className="coaching-number">{i + 1}</span>
                        <span className="coaching-label">{fb.label}</span>
                      </div>
                      {markers && markers.length > 0 && (
                        <div className="coaching-timestamps">
                          {markers.map((m, mi) => (
                            <span key={mi} className="coaching-ts-badge">
                              <span className="ts-icon" aria-hidden="true">⏱</span>
                              <span className="ts-time">{m.time}</span>
                              <span className="ts-event">{m.event}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="coaching-section">
                        <div className="coaching-tag tag-situation">SITUATION</div>
                        <p className="coaching-text">{fb.situation}</p>
                      </div>
                      <div className="coaching-section">
                        <div className="coaching-tag tag-stop">STOP DOING</div>
                        <p className="coaching-text">{fb.stop_doing}</p>
                      </div>
                      <div className="coaching-section">
                        <div className="coaching-tag tag-start">START DOING</div>
                        <p className="coaching-text">{fb.start_doing}</p>
                      </div>
                      <div className="coaching-section">
                        <div className="coaching-tag tag-impact">EXPECTED IMPACT</div>
                        <p className="coaching-text coaching-impact">{fb.expected_impact}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
