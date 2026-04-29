import type { SessionContext } from '../types/session';

export type PentagonAxis = {
  id: string;
  label: string;
  short: string;
  /** 0–100 */
  value: number;
};

export type PresenterArchetype = {
  emoji: string;
  title: string;
  tagline: string;
  /** secondary flair e.g. "Voice-forward" */
  accent: string;
};

function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** 리포트용 오각형(레이더) 5축 — 기존 세션 필드만 사용 */
export function buildPentagonAxes(session: SessionContext): PentagonAxis[] {
  const rep = session.report;
  const speech = clamp100(rep.speech_score);
  const body = clamp100(rep.nonverbal_score);
  const pressure = session.qa_skipped
    ? clamp100((rep.speech_score + rep.nonverbal_score) / 2)
    : clamp100(rep.qa_score);
  const gazeConn = clamp100(session.nonverbal_coaching.gaze_rate * 100);

  let prep = clamp100(session.material.pre_quiz_score);
  if (session.material.pre_quiz_grades.length === 0) {
    prep = clamp100(52 + Math.min(40, session.material.keywords.length * 5));
  }

  return [
    { id: 'voice', label: 'Voice & clarity', short: 'Voice', value: speech },
    { id: 'body', label: 'Stage presence', short: 'Body', value: body },
    { id: 'pressure', label: 'Under pressure', short: 'Q&A', value: pressure },
    { id: 'prep', label: 'Material prep', short: 'Prep', value: prep },
    { id: 'connection', label: 'Eye connection', short: 'Eyes', value: gazeConn },
  ];
}

export function derivePresenterArchetype(axes: PentagonAxis[], composite: number): PresenterArchetype {
  const byId = Object.fromEntries(axes.map((a) => [a.id, a.value])) as Record<string, number>;
  const top = [...axes].sort((a, b) => b.value - a.value)[0];
  const voice = byId.voice ?? 0;
  const body = byId.body ?? 0;
  const pressure = byId.pressure ?? 0;

  let accent = 'Balanced';
  if (top?.id === 'voice') accent = 'Voice-forward';
  else if (top?.id === 'body') accent = 'Presence-forward';
  else if (top?.id === 'pressure') accent = 'Pressure-tested';
  else if (top?.id === 'prep') accent = 'Prep-strong';
  else if (top?.id === 'connection') accent = 'Connection-led';

  if (composite >= 86) {
    return { emoji: '🌟', title: 'Spotlight closer', tagline: 'Polished delivery with standout moments.', accent };
  }
  if (composite >= 72) {
    return { emoji: '🎯', title: 'Stage-ready operator', tagline: 'Reliable structure — tighten one weak axis next run.', accent };
  }
  if (composite >= 55) {
    return { emoji: '🌱', title: 'Rising presenter', tagline: 'Momentum is there — focus drills on your lowest radar spoke.', accent };
  }
  if (voice < 52 && body > pressure) {
    return { emoji: '🎭', title: 'Physical storyteller', tagline: 'Body leads the room — bring the script energy up to match.', accent };
  }
  if (pressure > voice + 8) {
    return { emoji: '⚡', title: 'Cool under questions', tagline: 'Q&A is a strength — now widen verbal color.', accent };
  }
  return { emoji: '🔧', title: 'Rebuild sprint', tagline: 'Treat the next session as a focused technique pass.', accent };
}

export function buildShareBlurb(session: SessionContext, archetype: PresenterArchetype): string {
  const rep = session.report;
  const axes = buildPentagonAxes(session);
  const parts = axes.map((a) => `${a.short} ${a.value}`).join(' · ');
  return `Point practice — ${archetype.emoji} ${archetype.title} (${rep.composite_score}/100). ${parts}`;
}

const RAD_STEP = 360 / 5;

/** 레이더 꼭짓점 (index 0 = top) */
export function radarPoint(cx: number, cy: number, radius: number, index: number): [number, number] {
  const deg = -90 + RAD_STEP * index;
  const rad = (deg * Math.PI) / 180;
  return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
}

export function radarDataPolygon(axes: PentagonAxis[], cx: number, cy: number, rMax: number): string {
  return axes
    .map((a, i) => {
      const r = rMax * (a.value / 100);
      const [x, y] = radarPoint(cx, cy, r, i);
      return `${x},${y}`;
    })
    .join(' ');
}

export function derivePresenterArchetypeFromSession(session: SessionContext): PresenterArchetype {
  return derivePresenterArchetype(buildPentagonAxes(session), session.report.composite_score);
}
