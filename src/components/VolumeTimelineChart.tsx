import type { VolumeSample } from '../types/session';

interface Props {
  samples: VolumeSample[];
  sessionStartedAt: string;
  totalDurationSec: number;
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Downsample to at most maxPts evenly-spaced points */
function downsample(samples: VolumeSample[], maxPts: number): VolumeSample[] {
  if (samples.length <= maxPts) return samples;
  const step = samples.length / maxPts;
  return Array.from({ length: maxPts }, (_, i) => samples[Math.round(i * step)]);
}

export function VolumeTimelineChart({ samples, sessionStartedAt, totalDurationSec }: Props) {
  if (samples.length < 2) return null;

  const startMs = new Date(sessionStartedAt).getTime();
  const durationMs = Math.max(totalDurationSec * 1000, 1);

  const pts = downsample(samples, 300);

  const W = 640; const H = 100;
  const pad = { top: 10, right: 16, bottom: 24, left: 36 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const xOf = (s: VolumeSample) =>
    pad.left + Math.min(((s.timestamp - startMs) / durationMs) * plotW, plotW);
  const yOf = (rms: number) => pad.top + (1 - Math.min(rms, 1)) * plotH;

  const firstX = xOf(pts[0]);
  const lastX  = xOf(pts[pts.length - 1]);
  const baseY  = yOf(0);

  const polyPoints = [
    `${firstX},${baseY}`,
    ...pts.map((s) => `${xOf(s)},${yOf(s.rms)}`),
    `${lastX},${baseY}`,
  ].join(' ');

  // emphasis peaks (rms > 0.35)
  const peaks = pts.filter((s) => s.rms > 0.35);

  // x-axis tick interval (every ~30 s)
  const tickSec = totalDurationSec <= 120 ? 30 : totalDurationSec <= 300 ? 60 : 120;
  const ticks: number[] = [];
  for (let t = 0; t <= totalDurationSec; t += tickSec) ticks.push(t);

  return (
    <div className="vol-chart-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="vol-chart-svg"
        preserveAspectRatio="xMidYMid meet"
        aria-label="Voice emphasis timeline"
      >
        <defs>
          <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {/* y-axis gridlines */}
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line
              x1={pad.left} y1={yOf(v)} x2={W - pad.right} y2={yOf(v)}
              stroke="rgba(255,255,255,0.06)" strokeWidth="1"
            />
            <text
              x={pad.left - 5} y={yOf(v)}
              textAnchor="end" dominantBaseline="middle"
              fontSize="8" fill="rgba(255,255,255,0.28)"
            >{v === 0 ? 'low' : v === 1 ? 'high' : ''}</text>
          </g>
        ))}

        {/* x-axis ticks */}
        {ticks.map((t) => {
          const x = pad.left + (t / totalDurationSec) * plotW;
          return (
            <g key={t}>
              <line x1={x} y1={pad.top + plotH} x2={x} y2={pad.top + plotH + 3}
                stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
              <text x={x} y={H - 4}
                textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.28)"
              >{fmtTime(t)}</text>
            </g>
          );
        })}

        {/* area fill */}
        <polygon points={polyPoints} fill="url(#volGrad)" />

        {/* line */}
        <polyline
          points={pts.map((s) => `${xOf(s)},${yOf(s.rms)}`).join(' ')}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          opacity="0.85"
        />

        {/* emphasis peak dots */}
        {peaks.map((s, i) => (
          <circle key={i} cx={xOf(s)} cy={yOf(s.rms)} r="3"
            fill="var(--amber)" stroke="var(--surface)" strokeWidth="1.5"
          >
            <title>{`${fmtTime(Math.round((s.timestamp - startMs) / 1000))}: emphasis`}</title>
          </circle>
        ))}
      </svg>

      <div className="vol-chart-legend">
        <span className="vol-legend-line" />
        <span className="vol-legend-label">Volume level</span>
        <span className="vol-peak-dot" />
        <span className="vol-legend-label">Emphasis peak (&gt; 70%)</span>
      </div>
    </div>
  );
}
