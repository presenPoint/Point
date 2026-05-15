import { useMemo } from 'react';
import type { SessionContext } from '../types/session';
import {
  buildPentagonAxes,
  derivePresenterArchetypeFromSession,
  radarDataPolygon,
  radarPoint,
  type PentagonAxisId,
  type PresenterAccentId,
  type PresenterArchetypeId,
} from '../lib/reportPentagon';
import { useToastStore } from '../store/toastStore';
import { useT } from '../hooks/useT';
import type { MessageKey } from '../locales/messages';

const VIEW = { cx: 110, cy: 112, rMax: 78, rGrid: 82, rLabel: 96 };

const AXIS_LABEL: Record<PentagonAxisId, MessageKey> = {
  voice: 'report.axis.voice.label',
  body: 'report.axis.body.label',
  pressure: 'report.axis.pressure.label',
  prep: 'report.axis.prep.label',
  connection: 'report.axis.connection.label',
};

const AXIS_SHORT: Record<PentagonAxisId, MessageKey> = {
  voice: 'report.axis.voice.short',
  body: 'report.axis.body.short',
  pressure: 'report.axis.pressure.short',
  prep: 'report.axis.prep.short',
  connection: 'report.axis.connection.short',
};

const ARCH_TITLE: Record<PresenterArchetypeId, MessageKey> = {
  spotlight_closer: 'report.archetype.spotlight_closer.title',
  stage_ready_operator: 'report.archetype.stage_ready_operator.title',
  rising_presenter: 'report.archetype.rising_presenter.title',
  physical_storyteller: 'report.archetype.physical_storyteller.title',
  cool_under_questions: 'report.archetype.cool_under_questions.title',
  rebuild_sprint: 'report.archetype.rebuild_sprint.title',
};

const ARCH_TAGLINE: Record<PresenterArchetypeId, MessageKey> = {
  spotlight_closer: 'report.archetype.spotlight_closer.tagline',
  stage_ready_operator: 'report.archetype.stage_ready_operator.tagline',
  rising_presenter: 'report.archetype.rising_presenter.tagline',
  physical_storyteller: 'report.archetype.physical_storyteller.tagline',
  cool_under_questions: 'report.archetype.cool_under_questions.tagline',
  rebuild_sprint: 'report.archetype.rebuild_sprint.tagline',
};

const ACCENT: Record<PresenterAccentId, MessageKey> = {
  balanced: 'report.accent.balanced',
  voice_forward: 'report.accent.voice_forward',
  presence_forward: 'report.accent.presence_forward',
  pressure_tested: 'report.accent.pressure_tested',
  prep_strong: 'report.accent.prep_strong',
  connection_led: 'report.accent.connection_led',
};

export function ReportPentagonCard({ session }: { session: SessionContext }) {
  const t = useT();
  const axes = useMemo(() => buildPentagonAxes(session), [session]);
  const archetype = useMemo(() => derivePresenterArchetypeFromSession(session), [session]);
  const dataPts = useMemo(
    () => radarDataPolygon(axes, VIEW.cx, VIEW.cy, VIEW.rMax),
    [axes],
  );

  const gridPolygons = [0.25, 0.5, 0.75, 1].map((tStep) =>
    axes
      .map((_, i) => {
        const [x, y] = radarPoint(VIEW.cx, VIEW.cy, VIEW.rGrid * tStep, i);
        return `${x},${y}`;
      })
      .join(' '),
  );

  const copyShare = async () => {
    const rep = session.report;
    const axisParts = axes.map((a) => `${t(AXIS_SHORT[a.id])} ${a.value}`).join(' · ');
    const title = t(ARCH_TITLE[archetype.variantId]);
    const text = t('report.shareBlurb', {
      emoji: archetype.emoji,
      title,
      score: rep.composite_score,
      axes: axisParts,
    });
    try {
      await navigator.clipboard.writeText(text);
      useToastStore.getState().showToast(t('report.copyShareOk'));
    } catch {
      useToastStore.getState().showToast(t('report.copyShareFail'));
    }
  };

  return (
    <div className="report-pentagon-card">
      <div className="report-section-title">{t('report.pentagon.title')}</div>
      <p className="report-pentagon-lead">
        {t('report.pentagon.lead')}
      </p>

      <div className="report-pentagon-layout">
        <div className="report-pentagon-radar-wrap">
          <svg
            className="report-pentagon-svg"
            viewBox="0 0 220 220"
            role="img"
            aria-label={t('report.pentagon.radarAria')}
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
                  {t(AXIS_SHORT[a.id])}
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
              <div className="report-pentagon-type-title">{t(ARCH_TITLE[archetype.variantId])}</div>
              <div className="report-pentagon-type-accent">{t(ACCENT[archetype.accentId])}</div>
            </div>
          </div>
          <p className="report-pentagon-tagline">{t(ARCH_TAGLINE[archetype.variantId])}</p>
          <ul className="report-pentagon-legend">
            {axes.map((a) => (
              <li key={a.id}>
                <span className="report-pentagon-legend-label">{t(AXIS_LABEL[a.id])}</span>
                <span className="report-pentagon-legend-val">{a.value}</span>
              </li>
            ))}
          </ul>
          <div className="report-pentagon-actions">
            <button type="button" className="btn-sm" onClick={() => void copyShare()}>
              {t('report.pentagon.copyShare')}
            </button>
          </div>
          <p className="report-pentagon-footnote">
            {t('report.pentagon.footnote')}
          </p>
        </div>
      </div>
    </div>
  );
}
