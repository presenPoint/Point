import { useEffect, useState } from 'react';
import { loadSessionHistory, type SessionHistoryItem } from '../store/sessionStore';
import type { ActionableFeedback, TimeMarker } from '../types/session';
import { ScoreRing } from './ScoreRing';
import { transcriptWithTimestamps } from '../lib/transcriptScript';
import { AnimatedPointLogo } from './AnimatedPointLogo';
import { useSessionStore } from '../store/sessionStore';
import { analyzeProgress, type ProgressAnalysis } from '../agents/progressAnalysisAgent';
import { hasOpenAI } from '../lib/openai';

interface Props {
  userId: string;
  userName?: string;
  userAvatar?: string;
  onBack: () => void;
}

/* ── Helpers ── */
function fmt(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}
function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}
function fmtShortDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ── AI Analysis Panel ── */
const TREND_META = {
  improving: { icon: '↑', label: 'Improving',      color: 'var(--green)'  },
  declining:  { icon: '↓', label: 'Needs attention', color: 'var(--amber)'  },
  stable:     { icon: '→', label: 'Stable',          color: 'var(--cyan)'   },
  early:      { icon: '◎', label: 'Early stage',     color: 'var(--violet)' },
} satisfies Record<string, { icon: string; label: string; color: string }>;

function AIAnalysisPanel({ history }: { history: SessionHistoryItem[] }) {
  const [analysis, setAnalysis] = useState<ProgressAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await analyzeProgress(history);
      if (!result) {
        setError('Could not generate analysis. Check your OpenAI API key.');
      } else {
        setAnalysis(result);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  // Auto-run when history is available
  useEffect(() => {
    if (history.length > 0 && hasOpenAI()) {
      void run();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trend = analysis ? TREND_META[analysis.trend_label] : null;

  return (
    <div className="db-ai-panel">
      {/* Header row */}
      <div className="db-ai-header">
        <div className="db-ai-header-left">
          <span className="db-ai-badge">🤖 AI COACH</span>
          <p className="db-ai-desc">
            AI analyzes all your session data to surface growth trends and targeted coaching recommendations.
          </p>
        </div>
        {analysis && !busy && (
          <button
            type="button"
            className="btn-sm"
            onClick={() => void run()}
            disabled={busy}
          >
            Refresh
          </button>
        )}
      </div>

      {!hasOpenAI() && (
        <p className="db-ai-warn">
          Set <code>VITE_OPENAI_API_KEY</code> to enable AI analysis.
        </p>
      )}
      {error && <p className="db-ai-error">{error}</p>}

      {busy && (
        <div className="db-ai-loading">
          <span className="db-ai-spinner db-ai-spinner--lg" aria-hidden="true" />
          <span>Analyzing {history.length} session{history.length !== 1 ? 's' : ''}…</span>
        </div>
      )}

      {analysis && !busy && (
        <div className="db-ai-result">
          {/* Trend + summary */}
          <div className="db-ai-summary-row">
            {trend && (
              <span
                className="db-ai-trend-badge"
                style={{ '--tc': trend.color } as React.CSSProperties}
              >
                {trend.icon} {trend.label}
              </span>
            )}
            <p className="db-ai-summary">{analysis.summary}</p>
          </div>

          {/* Highlight */}
          {analysis.highlight && (
            <div className="db-ai-highlight">
              <span className="db-ai-highlight-icon">🏆</span>
              <span>{analysis.highlight}</span>
            </div>
          )}

          {/* Strengths + Growth areas */}
          <div className="db-ai-two-col">
            {analysis.strengths.length > 0 && (
              <div className="db-ai-col">
                <div className="db-ai-col-title">Consistent strengths</div>
                <ul className="db-ai-list db-ai-list--green">
                  {analysis.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.growth_areas.length > 0 && (
              <div className="db-ai-col">
                <div className="db-ai-col-title">Areas to focus on</div>
                <ul className="db-ai-list db-ai-list--amber">
                  {analysis.growth_areas.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Recommendations */}
          {analysis.recommendations.length > 0 && (
            <div className="db-ai-recs">
              <div className="db-ai-col-title">Next steps</div>
              {analysis.recommendations.map((r, i) => (
                <div key={i} className="db-ai-rec-card">
                  <div className="db-ai-rec-action">{r.action}</div>
                  <div className="db-ai-rec-reason">{r.reason}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Growth Chart ── */
type LineKey = 'composite' | 'speech' | 'nonverbal' | 'qa';
const LINE_META: { key: LineKey; label: string; cssVar: string }[] = [
  { key: 'composite', label: 'Overall',   cssVar: 'var(--amber)'  },
  { key: 'speech',    label: 'Speech',    cssVar: 'var(--cyan)'   },
  { key: 'nonverbal', label: 'Nonverbal', cssVar: 'var(--violet)' },
  { key: 'qa',        label: 'Q&A',       cssVar: 'var(--green)'  },
];

function GrowthChart({ history }: { history: SessionHistoryItem[] }) {
  const [active, setActive] = useState<Record<LineKey, boolean>>({
    composite: true, speech: false, nonverbal: false, qa: false,
  });
  const toggle = (k: LineKey) => setActive((p) => ({ ...p, [k]: !p[k] }));

  // oldest → newest
  const sorted = [...history].reverse();
  const n = sorted.length;

  const W = 600; const H = 210;
  const pad = { top: 26, right: 24, bottom: 34, left: 34 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const xOf = (i: number) =>
    n === 1 ? pad.left + plotW / 2 : pad.left + (i / (n - 1)) * plotW;
  const yOf = (score: number) => pad.top + (1 - Math.min(score, 100) / 100) * plotH;

  const scoreOf: Record<LineKey, (s: SessionHistoryItem) => number> = {
    composite: (s) => s.composite_score ?? 0,
    speech:    (s) => s.speech_score    ?? 0,
    nonverbal: (s) => s.nonverbal_score ?? 0,
    qa:        (s) => s.qa_score        ?? 0,
  };

  const gridValues = [0, 25, 50, 75, 100];

  return (
    <div className="db-chart-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="db-chart-svg"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        {/* gridlines */}
        {gridValues.map((v) => (
          <g key={v}>
            <line
              x1={pad.left} y1={yOf(v)} x2={W - pad.right} y2={yOf(v)}
              stroke="rgba(255,255,255,0.07)" strokeWidth="1"
            />
            <text
              x={pad.left - 6} y={yOf(v)}
              textAnchor="end" dominantBaseline="middle"
              fontSize="9" fill="rgba(255,255,255,0.28)"
            >{v}</text>
          </g>
        ))}

        {/* x-axis labels */}
        {sorted.map((s, i) => (
          <text
            key={s.session_id}
            x={xOf(i)} y={H - 6}
            textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.28)"
          >{fmtShortDate(s.started_at)}</text>
        ))}

        {/* lines + dots + value labels */}
        {LINE_META.map(({ key, cssVar }) => {
          if (!active[key]) return null;
          const scores = sorted.map((s) => scoreOf[key](s));
          const d = scores.map((sc, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(sc)}`).join(' ');
          return (
            <g key={key}>
              <path d={d} fill="none" stroke={cssVar} strokeWidth="2.5"
                strokeLinejoin="round" strokeLinecap="round" />
              {scores.map((sc, i) => {
                const cx = xOf(i);
                const cy = yOf(sc);
                // place label above dot unless it's near the top edge
                const labelAbove = cy > pad.top + 18;
                const labelY = labelAbove ? cy - 11 : cy + 20;
                return (
                  <g key={i}>
                    <circle cx={cx} cy={cy} r="5"
                      fill={cssVar} stroke="var(--surface)" strokeWidth="2" />
                    <text
                      x={cx} y={labelY}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="700"
                      fill={cssVar}
                      opacity="0.95"
                    >{sc}</text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* Legend toggles */}
      <div className="db-chart-legend">
        {LINE_META.map(({ key, label, cssVar }) => (
          <button
            key={key}
            type="button"
            className={`db-legend-btn${active[key] ? ' db-legend-btn--on' : ''}`}
            style={{ '--lc': cssVar } as React.CSSProperties}
            onClick={() => toggle(key)}
          >
            <span className="db-legend-dot" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Session detail (shared between expanded cards) ── */
function SessionDetailPanel({ s }: { s: SessionHistoryItem }) {
  const improvements = (s.improvements ?? []) as (ActionableFeedback | string)[];
  const hasTranscript = Array.isArray(s.transcript_log) && s.transcript_log.length > 0;
  const transcriptText = hasTranscript
    ? transcriptWithTimestamps(s.transcript_log!, s.started_at)
    : null;

  return (
    <div className="db-detail-content">
      {/* Score rings */}
      <div className="db-sub-title">Scores</div>
      <div className="score-row db-score-row">
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
          <div className="circle-label">Q&amp;A<br />Delivery</div>
        </div>
        <div className="score-circle">
          <ScoreRing value={s.composite_score} colorVar="var(--amber)" />
          <div className="circle-label">Overall<br />Score</div>
        </div>
      </div>

      {/* Strengths */}
      {s.strengths.length > 0 && (
        <>
          <div className="db-sub-title">Strengths 👍</div>
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

      {/* Actionable Coaching */}
      {improvements.length > 0 && (
        <>
          <div className="db-sub-title">Actionable Coaching</div>
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

      {/* Style Coaching */}
      {s.persona_style_coaching && (
        <>
          <div className="db-sub-title">Style Coaching</div>
          <div className="report-persona-panel">
            <p className="report-persona-alignment">{s.persona_style_coaching.style_alignment}</p>
            {s.persona_style_coaching.delivery_practices.length > 0 && (
              <>
                <h4 className="report-persona-sub">Next-session practices</h4>
                <ul className="report-persona-practices">
                  {s.persona_style_coaching.delivery_practices.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </>
            )}
            {(s.persona_style_coaching.phrase_rewrites?.length ?? 0) > 0 && (
              <>
                <h4 className="report-persona-sub">Phrase rewrites</h4>
                <div className="report-rewrite-list">
                  {s.persona_style_coaching.phrase_rewrites!.map((rw, i) => (
                    <div key={i} className="report-rewrite-card">
                      <div className="report-rewrite-label">What you said</div>
                      <p className="report-rewrite-from">{rw.from_session}</p>
                      <div className="report-rewrite-label report-rewrite-label-alt">Coach-style phrasing</div>
                      <p className="report-rewrite-to">{rw.persona_aligned_example}</p>
                      {rw.why && (
                        <>
                          <div className="report-rewrite-label report-rewrite-label-why">Why</div>
                          <p className="report-rewrite-why">{rw.why}</p>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Transcript */}
      {transcriptText && (
        <>
          <div className="db-sub-title">Speech Transcript</div>
          <pre className="db-transcript-pre" tabIndex={0}>{transcriptText}</pre>
        </>
      )}
    </div>
  );
}

/* ── Past presentation card (accordion) ── */
function PastPresentationCard({ s }: { s: SessionHistoryItem }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`db-pcard${open ? ' db-pcard--open' : ''}`}>
      <button
        type="button"
        className="db-pcard-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="db-pcard-left">
          <span className="db-pcard-date">{fmt(s.started_at)}</span>
          <span className="db-pcard-dur">{fmtDuration(s.total_duration_sec)}</span>
        </div>
        <div className="db-pcard-pills">
          {[
            { v: s.composite_score, c: 'var(--amber)', l: 'Overall' },
            { v: s.speech_score,    c: 'var(--cyan)',   l: 'Speech'   },
            { v: s.nonverbal_score, c: 'var(--violet)', l: 'Nonverbal'},
            { v: s.qa_score,        c: 'var(--green)',  l: 'Q&A'      },
          ].map(({ v, c, l }) => (
            <span
              key={l}
              className="db-pcard-pill"
              style={{ '--pc': c } as React.CSSProperties}
              title={l}
            >{v}</span>
          ))}
        </div>
        <span className="db-pcard-chevron" aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="db-pcard-body">
          <SessionDetailPanel s={s} />
        </div>
      )}
    </div>
  );
}

/* ── Main Dashboard ── */
export function DashboardScreen({ userId, userName, userAvatar, onBack }: Props) {
  const setAppStarted = useSessionStore((s) => s.setAppStarted);
  const [history, setHistory] = useState<SessionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessionHistory(userId).then((data) => {
      setHistory(data);
      setLoading(false);
    });
  }, [userId]);

  const n = history.length;

  return (
    <div className="db-screen point-screen">
      {/* Top bar */}
      <div className="db-topbar">
        <div className="db-topbar-left">
          <AnimatedPointLogo onHomeClick={() => setAppStarted(false)} ariaLabel="Point — Home" />
          <button type="button" className="btn-sm db-back-btn" onClick={onBack}>← Home</button>
        </div>
        <h1 className="db-topbar-title">My Progress</h1>
        <div className="db-topbar-user">
          {userAvatar && (
            <img className="db-user-avatar" src={userAvatar} alt="" referrerPolicy="no-referrer" />
          )}
          {userName && <span className="db-user-name">{userName}</span>}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="db-main">
        {loading ? (
          <div className="db-loading">Loading your sessions…</div>
        ) : n === 0 ? (
          <div className="db-empty">
            <p className="db-empty-title">No sessions yet</p>
            <p className="db-empty-sub">Complete a presentation to see your progress here.</p>
            <button type="button" className="btn-primary" onClick={onBack}>Start practicing →</button>
          </div>
        ) : (
          <>
            {/* AI Progress Analysis */}
            <section className="db-section">
              <div className="db-section-heading">
                AI Progress Analysis
              </div>
              <AIAnalysisPanel history={history} />
            </section>

            {/* Growth Overview */}
            <section className="db-section">
              <div className="db-section-heading">
                Growth Overview
                <span className="db-section-note">
                  {n === 1 ? '1 session — present more to see trends' : `${n} sessions`}
                </span>
              </div>
              <GrowthChart history={history} />
            </section>

            {/* Past Presentations */}
            <section className="db-section">
              <div className="db-section-heading">
                Past Presentations
                <span className="db-section-note">{n} total</span>
              </div>
              <div className="db-pcards">
                {history.map((s) => (
                  <PastPresentationCard key={s.session_id} s={s} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
