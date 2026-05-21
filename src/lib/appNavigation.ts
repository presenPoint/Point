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

function snapshotForNavigateBack() {
  const nav = useAppNavStore.getState();
  const sess = useSessionStore.getState();
  return { nav, sess, route: computeAppRoute({
    landingDone: nav.landingDone,
    showDashboard: nav.showDashboard,
    showPricing: nav.showPricing,
    appStarted: sess.appStarted,
    selectedPersona: sess.selectedPersona,
    skipPersonaSurvey: sess.skipPersonaSurvey,
    presentationMode: nav.presentationMode,
    status: sess.session.status,
  }) };
}

/** 앱 단계 기준 뒤로 — history.back()만 쓰면 같은 화면에 머무는 경우가 있어 스토어를 직접 되돌림 */
/** 로그인 상태에서 서비스 소개(메인) 랜딩으로 */
export function navigateToMarketingHome(): void {
  if (typeof window === 'undefined') return;
  useAppNavStore.getState().openMarketingHome();
  useSessionStore.setState({ appStarted: false, selectedPersona: null, skipPersonaSurvey: false });
}

export function navigateBack(): void {
  if (typeof window === 'undefined') return;

  const { nav, sess, route } = snapshotForNavigateBack();

  switch (route) {
    case 'pricing':
      nav.setShowPricing(false);
      return;
    case 'prepare':
      nav.setPresentationMode(null);
      return;
    case 'mode':
      nav.setPresentationMode(null);
      useSessionStore.setState({ appStarted: false });
      return;
    case 'survey':
      useSessionStore.setState({
        selectedPersona: null,
        skipPersonaSurvey: false,
      });
      return;
    case 'live':
      useSessionStore.getState().transition('IDLE');
      return;
    case 'report':
      if (sess.session.status === 'DONE' || sess.session.status === 'REPORT' || sess.session.status === 'POST_QA') {
        useSessionStore.setState((prev) => ({
          session: { ...prev.session, status: 'IDLE' },
          appStarted: true,
        }));
        nav.setPresentationMode('with-materials');
      }
      return;
    case 'dashboard':
      nav.setShowDashboard(false);
      return;
    case 'coach':
      nav.enterCoachHome();
      return;
    case 'landing':
      nav.setLandingDone(false);
      return;
    default:
      break;
  }

  if (window.history.length > 1) {
    window.history.back();
    return;
  }

  nav.setShowPricing(false);
  nav.setShowDashboard(false);
  nav.setPresentationMode(null);
  useSessionStore.getState().setAppStarted(false);
}
