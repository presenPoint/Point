import { useAppNavStore } from '../store/appNavStore';
import { useSessionStore, type PersonaType } from '../store/sessionStore';
import type { PresentationMode } from '../store/appNavStore';
import type { SessionStatus } from '../types/session';

export type AppRouteId =
  | 'landing'
  | 'coach'
  | 'dashboard'
  | 'pricing'
  | 'survey'
  | 'mode'
  | 'prepare'
  | 'live'
  | 'report';

export type AppHistState = {
  route: AppRouteId;
  landingDone: boolean;
  showDashboard: boolean;
  showPricing: boolean;
  presentationMode: PresentationMode;
  appStarted: boolean;
  persona: PersonaType | null;
  skipPersonaSurvey: boolean;
  status: SessionStatus;
};

export function computeAppRoute(input: {
  landingDone: boolean;
  showDashboard: boolean;
  showPricing: boolean;
  appStarted: boolean;
  selectedPersona: PersonaType | null;
  skipPersonaSurvey: boolean;
  presentationMode: PresentationMode;
  status: SessionStatus;
}): AppRouteId {
  if (input.showPricing) return 'pricing';
  if (!input.landingDone && !input.appStarted) return 'landing';
  if (!input.appStarted && input.showDashboard) return 'dashboard';
  if (!input.appStarted) return 'coach';
  if (!input.selectedPersona && !input.skipPersonaSurvey) return 'survey';
  if (input.status === 'PRESENTING') return 'live';
  if (input.status === 'POST_QA' || input.status === 'REPORT' || input.status === 'DONE') return 'report';
  if (!input.presentationMode) return 'mode';
  return 'prepare';
}

/** 브라우저·앱 뒤로 가기 — 직전 화면으로 (랜딩으로 점프하지 않음) */
export function navigateBack(): void {
  if (typeof window === 'undefined') return;
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  /* 히스토리가 없을 때만 코치 화면으로 폴백 */
  const nav = useAppNavStore.getState();
  nav.setShowPricing(false);
  nav.setShowDashboard(false);
  nav.setPresentationMode(null);
  useSessionStore.getState().setAppStarted(false);
}
