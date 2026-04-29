import { useSessionStore } from '../store/sessionStore';

/** gpt-4o-mini-tts 에서 자주 쓰는 보이스 (API 지원 목록 기준) */
export const COACH_TTS_VOICE_OPTIONS: Array<{ id: string; label: string; hint?: string }> = [
  { id: '', label: 'Coach default', hint: 'Follows your selected persona' },
  { id: 'coral', label: 'Coral', hint: 'Clear, bright' },
  { id: 'sage', label: 'Sage', hint: 'Warm, grounded' },
  { id: 'onyx', label: 'Onyx', hint: 'Deep, steady' },
  { id: 'nova', label: 'Nova', hint: 'Upbeat' },
  { id: 'shimmer', label: 'Shimmer', hint: 'Soft' },
  { id: 'alloy', label: 'Alloy', hint: 'Neutral' },
  { id: 'echo', label: 'Echo', hint: 'Male-presenting' },
  { id: 'fable', label: 'Fable', hint: 'Expressive' },
  { id: 'ballad', label: 'Ballad', hint: 'Warm narrative' },
  { id: 'ash', label: 'Ash', hint: 'Even' },
];

const ALLOWED = new Set(
  COACH_TTS_VOICE_OPTIONS.filter((o) => o.id).map((o) => o.id),
);

/** OpenAI TTS `voice` 파라미터 — 페르소나 기본값 또는 사용자 오버라이드 */
export function effectiveOpenAiTtsVoice(personaDefaultVoice: string): string {
  const o = useSessionStore.getState().coachTtsVoiceOverride;
  if (o && ALLOWED.has(o)) return o;
  return personaDefaultVoice;
}
