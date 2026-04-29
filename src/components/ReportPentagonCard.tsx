import { useMemo } from 'react';
import type { SessionContext } from '../types/session';
import {
  buildPentagonAxes,
  buildShareBlurb,
  derivePresenterArchetypeFromSession,
  radarDataPolygon,
  radarPoint,
} from '../lib/reportPentagon';
import { useToastStore } from '../store/toastStore';

const VIEW = { cx: 110, cy: 112, rMax: 78, rGrid: 82, rLabel: 96 };

export function ReportPentagonCard({ session }: { session: SessionContext }) {
  const axes = useMemo(() => buildPentagonAxes(session), [session]);
  const archetype = useMemo(() => derivePresenterArchetypeFromSession(session), [session]);
  const dataPts = useMemo(
    () => radarDataPolygon(axes, VIEW.cx, VIEW.cy, VIEW.rMax),
    [axes],
  );

  const gridPolygons = [0.25, 0.5, 0.75, 1].map((t) =>
    axes
      .map((_, i) => {
        const [x, y] = radarPoint(VIEW.cx, VIEW.cy, VIEW.rGrid * t, i);
        return `${x},${y}`;
      })
      .join(' '),
  );

  const copyShare = async () => {
    const text = buildShareBlurb(session, archetype);
    try {
      await navigator.clipboard.writeText(text);
      useToastStore.getState().showToast('Copied share snippet');
    } catch {
      useToastStore.getState().showToast('Copy blocked — select text manually');
    }
  };

  return (
    <div className="report-pentagon-card">
      <div className="report-section-title">Presenter profile</div>
      <p className="report-pentagon-lead">
        Five practice dimensions (0–100). This is a playful snapshot — not a psychometric test.
      </p>

      <div className="report-pentagon-layout">
        <div className="report-pentagon-radar-wrap">
          <svg
            className="report-pentagon-svg"
            viewBox="0 0 220 220"
            role="img"
            aria-label="Pentagon radar chart of practice dimensions"
          >
            <defs>
              <linearGradient id="radarFillGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
                <stop offset="100%" stopColor="var(--violet)" stopOpacity="0.12" />
              </linearGradient>
            </defs>
            {gridPolygons.map((pts, idx) => (
              <polygon
                key={idx}
                points={pts}
                fill="none"
                stroke="var(--border2)"
                strokeWidth={idx === 3 ? 1.2 : 0.6}
                opacity={0.55 + idx * 0.08}
              />
            ))}
            {axes.map((_, i) => {
              const [x1, y1] = radarPoint(VIEW.cx, VIEW.cy, 0, i);
              const [x2, y2] = radarPoint(VIEW.cx, VIEW.cy, VIEW.rGrid, i);
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="var(--border2)"
                  strokeWidth="0.7"
                  opacity="0.65"
                />
              );
            })}
            <polygon
              points={dataPts}
              fill="url(#radarFillGrad)"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            {axes.map((a, i) => {
              const [lx, ly] = radarPoint(VIEW.cx, VIEW.cy, VIEW.rLabel, i);
              return (
                <text
                  key={a.id}
                  x={lx}
                  y={ly}
                  className="report-pentagon-axis-label"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {a.short}
                </text>
              );
            })}
          </svg>
        </div>

        <div className="report-pentagon-meta">
          <div className="report-pentagon-type">
            <span className="report-pentagon-emoji" aria-hidden>
              {archetype.emoji}
            </span>
            <div>
              <div className="report-pentagon-type-title">{archetype.title}</div>
              <div className="report-pentagon-type-accent">{archetype.accent}</div>
            </div>
          </div>
          <p className="report-pentagon-tagline">{archetype.tagline}</p>
          <ul className="report-pentagon-legend">
            {axes.map((a) => (
              <li key={a.id}>
                <span className="report-pentagon-legend-label">{a.label}</span>
                <span className="report-pentagon-legend-val">{a.value}</span>
              </li>
            ))}
          </ul>
          <div className="report-pentagon-actions">
            <button type="button" className="btn-sm" onClick={() => void copyShare()}>
              Copy share snippet
            </button>
          </div>
          <p className="report-pentagon-footnote">
            Session history &amp; trend charts: planned — pair with saved scores when you enable cloud sync.
          </p>
        </div>
      </div>
    </div>
  );
}
