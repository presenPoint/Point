import type { SessionContext } from '../types/session';

export type PentagonAxisId = 'voice' | 'body' | 'pressure' | 'prep' | 'connection';

export type PentagonAxis = {
  id: PentagonAxisId;
  /** 0–100 */
  value: number;
};

export type PresenterArchetypeId =
  | 'spotlight_closer'
  | 'stage_ready_operator'
  | 'rising_presenter'
  | 'physical_storyteller'
  | 'cool_under_questions'
  | 'rebuild_sprint';

export type PresenterAccentId =
  | 'balanced'
  | 'voice_forward'
  | 'presence_forward'
  | 'pressure_tested'
  | 'prep_strong'
  | 'connection_led';

export type PresenterArchetype = {
  emoji: string;
  variantId: PresenterArchetypeId;
  accentId: PresenterAccentId;
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
    { id: 'voice', value: speech },
    { id: 'body', value: body },
    { id: 'pressure', value: pressure },
    { id: 'prep', value: prep },
    { id: 'connection', value: gazeConn },
  ];
}

export function derivePresenterArchetype(axes: PentagonAxis[], composite: number): PresenterArchetype {
  const byId = Object.fromEntries(axes.map((a) => [a.id, a.value])) as Record<string, number>;
  const top = [...axes].sort((a, b) => b.value - a.value)[0];
  const voice = byId.voice ?? 0;
  const body = byId.body ?? 0;
  const pressure = byId.pressure ?? 0;

  let accentId: PresenterAccentId = 'balanced';
  if (top?.id === 'voice') accentId = 'voice_forward';
  else if (top?.id === 'body') accentId = 'presence_forward';
  else if (top?.id === 'pressure') accentId = 'pressure_tested';
  else if (top?.id === 'prep') accentId = 'prep_strong';
  else if (top?.id === 'connection') accentId = 'connection_led';

  if (composite >= 86) {
    return { emoji: '🌟', variantId: 'spotlight_closer', accentId };
  }
  if (composite >= 72) {
    return { emoji: '🎯', variantId: 'stage_ready_operator', accentId };
  }
  if (composite >= 55) {
    return { emoji: '🌱', variantId: 'rising_presenter', accentId };
  }
  if (voice < 52 && body > pressure) {
    return { emoji: '🎭', variantId: 'physical_storyteller', accentId };
  }
  if (pressure > voice + 8) {
    return { emoji: '⚡', variantId: 'cool_under_questions', accentId };
  }
  return { emoji: '🔧', variantId: 'rebuild_sprint', accentId };
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
