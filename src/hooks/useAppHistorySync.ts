import { useEffect, useRef } from 'react';
import { useAppNavStore } from '../store/appNavStore';
import { useSessionStore } from '../store/sessionStore';
import {
  computeAppRoute,
  type AppHistState,
  type AppRouteId,
} from '../lib/appNavigation';

function pathWithHash(route: AppRouteId): string {
  const hash = route === 'landing' ? '#/' : `#/${route}`;
  return `${window.location.pathname}${window.location.search}${hash}`;
}

function parseHashRoute(): AppRouteId | null {
  const h = window.location.hash.replace(/^#\/?/, '').replace(/\/$/, '');
  if (!h || h === 'landing' || h === 'home') return h === 'home' ? 'coach' : 'landing';
  const routes: AppRouteId[] = [
    'coach',
    'dashboard',
    'pricing',
    'survey',
    'mode',
    'prepare',
    'live',
    'report',
  ];
  return routes.includes(h as AppRouteId) ? (h as AppRouteId) : null;
}

function applyHistoryState(st: AppHistState | null) {
  if (!st || st.route === 'landing') {
    useAppNavStore.setState({
      landingDone: st?.landingDone ?? false,
      showMarketingHome: false,
      showDashboard: false,
      showPricing: false,
      presentationMode: null,
    });
    useSessionStore.setState({
      appStarted: false,
      selectedPersona: null,
      skipPersonaSurvey: false,
    });
    return;
  }

  useAppNavStore.setState({
    landingDone: st.landingDone,
    showDashboard: st.showDashboard,
    showPricing: st.showPricing,
    presentationMode: st.presentationMode ?? null,
  });

  useSessionStore.setState((prev) => ({
    appStarted: st.appStarted,
    selectedPersona: st.persona,
    skipPersonaSurvey: st.skipPersonaSurvey,
    session: {
      ...prev.session,
      status: st.status,
    },
  }));
}

function snapshotFromStores(): AppHistState {
  const nav = useAppNavStore.getState();
  const sess = useSessionStore.getState();
  const route = computeAppRoute({
    landingDone: nav.landingDone,
    showDashboard: nav.showDashboard,
    showPricing: nav.showPricing,
    appStarted: sess.appStarted,
    selectedPersona: sess.selectedPersona,
    skipPersonaSurvey: sess.skipPersonaSurvey,
    presentationMode: nav.presentationMode,
    status: sess.session.status,
  });
  return {
    route,
    landingDone: nav.landingDone,
    showDashboard: nav.showDashboard,
    showPricing: nav.showPricing,
    presentationMode: nav.presentationMode,
    appStarted: sess.appStarted,
    persona: sess.selectedPersona,
    skipPersonaSurvey: sess.skipPersonaSurvey,
    status: sess.session.status,
  };
}

/**
 * 브라우저 히스토리와 앱 화면을 동기화합니다.
 * 뒤로 가기 시 직전 단계(코치 → 설문 → 준비 → 발표 …)로 복원됩니다.
 */
/** React StrictMode 이중 마운트 시 landing으로 두 번 초기화되는 것 방지 */
let historyHydratedOnce = false;

export function useAppHistorySync(enabled = true) {
  const fromPopRef = useRef(false);
  const lastRouteRef = useRef<AppRouteId | null>(null);

  const landingDone = useAppNavStore((s) => s.landingDone);
  const showDashboard = useAppNavStore((s) => s.showDashboard);
  const showPricing = useAppNavStore((s) => s.showPricing);
  const presentationMode = useAppNavStore((s) => s.presentationMode);

  const appStarted = useSessionStore((s) => s.appStarted);
  const selectedPersona = useSessionStore((s) => s.selectedPersona);
  const skipPersonaSurvey = useSessionStore((s) => s.skipPersonaSurvey);
  const status = useSessionStore((s) => s.session.status);

  useEffect(() => {
    if (!enabled) return;

    const onPop = () => {
      fromPopRef.current = true;
      const st = history.state as AppHistState | null;
      if (st && typeof st.route === 'string') {
        applyHistoryState(st);
        lastRouteRef.current = st.route;
        return;
      }
      const hashRoute = parseHashRoute();
      if (hashRoute) {
        applyHistoryState({
          route: hashRoute,
          landingDone: hashRoute !== 'landing',
          showDashboard: hashRoute === 'dashboard',
          showPricing: hashRoute === 'pricing',
          presentationMode: hashRoute === 'prepare' ? 'with-materials' : null,
          appStarted: hashRoute !== 'landing' && hashRoute !== 'coach' && hashRoute !== 'dashboard',
          persona: null,
          skipPersonaSurvey: false,
          status: hashRoute === 'live' ? 'PRESENTING' : hashRoute === 'report' ? 'POST_QA' : 'IDLE',
        });
        lastRouteRef.current = hashRoute;
        return;
      }
      applyHistoryState(null);
      lastRouteRef.current = 'landing';
    };

    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    if (!historyHydratedOnce) {
      historyHydratedOnce = true;
      const st = history.state as AppHistState | null;
      if (st?.route) {
        applyHistoryState(st);
        lastRouteRef.current = st.route;
        return;
      }
      const hashRoute = parseHashRoute();
      if (hashRoute && hashRoute !== 'landing') {
        applyHistoryState({
          route: hashRoute,
          landingDone: true,
          showDashboard: hashRoute === 'dashboard',
          showPricing: hashRoute === 'pricing',
          presentationMode: hashRoute === 'prepare' ? 'with-materials' : null,
          appStarted: hashRoute !== 'coach' && hashRoute !== 'dashboard',
          persona: null,
          skipPersonaSurvey: false,
          status:
            hashRoute === 'live' ? 'PRESENTING' : hashRoute === 'report' ? 'POST_QA' : 'IDLE',
        });
        lastRouteRef.current = hashRoute;
        return;
      }
      const initial = snapshotFromStores();
      history.replaceState(initial, '', pathWithHash(initial.route));
      lastRouteRef.current = initial.route;
      return;
    }

    if (fromPopRef.current) {
      fromPopRef.current = false;
      return;
    }

    const state = snapshotFromStores();
    const route = state.route;

    if (lastRouteRef.current === route) {
      const want = pathWithHash(route);
      if (window.location.hash !== (route === 'landing' ? '#/' : `#/${route}`)) {
        history.replaceState(state, '', want);
      }
      return;
    }

    const prev = lastRouteRef.current;
    lastRouteRef.current = route;
    const url = pathWithHash(route);

    if (prev === null) {
      history.replaceState(state, '', url);
      return;
    }

    /* 발표 종료 → 리포트: 뒤로 가면 발표 화면이 아니라 준비/이전 단계로 */
    if (route === 'report' && prev === 'live') {
      history.replaceState(state, '', url);
      return;
    }

    history.pushState(state, '', url);
  }, [
    enabled,
    landingDone,
    showDashboard,
    showPricing,
    presentationMode,
    appStarted,
    selectedPersona,
    skipPersonaSurvey,
    status,
  ]);
}
