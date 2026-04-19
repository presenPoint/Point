import { useEffect, useRef } from 'react';
import { useSessionStore } from '../store/sessionStore';
import type { PersonaType } from '../store/sessionStore';
import type { SessionStatus } from '../types/session';

export type AppRouteId = 'home' | 'survey' | 'prepare' | 'live' | 'report';

type HistState = {
  route: AppRouteId;
  persona: PersonaType | null;
  status: SessionStatus;
  /** True when coaching uses built-in defaults (no persona) but the survey is skipped. */
  defaultCoaching?: boolean;
};

export function routeFromStore(
  appStarted: boolean,
  persona: PersonaType | null,
  status: SessionStatus,
  skipPersonaSurvey: boolean,
): AppRouteId {
  if (!appStarted) return 'home';
  if (!persona && !skipPersonaSurvey) return 'survey';
  if (status === 'IDLE' || status === 'PRE_QUIZ') return 'prepare';
  if (status === 'PRESENTING') return 'live';
  return 'report';
}

function pathWithHash(route: AppRouteId): string {
  const hash = route === 'home' ? '#/' : `#/${route}`;
  return `${window.location.pathname}${window.location.search}${hash}`;
}

function parseHashRoute(): AppRouteId | null {
  const h = window.location.hash.replace(/^#\/?/, '').replace(/\/$/, '');
  if (!h || h === 'home') return 'home';
  if (h === 'survey' || h === 'prepare' || h === 'live' || h === 'report') return h as AppRouteId;
  return null;
}

function normalizeHistState(st: HistState): HistState {
  if (
    (st.route === 'prepare' || st.route === 'live' || st.route === 'report') &&
    !st.persona &&
    !st.defaultCoaching
  ) {
    return { route: 'survey', persona: null, status: 'IDLE' };
  }
  return st;
}

function applyHistoryState(st: HistState | null) {
  if (!st || st.route === 'home') {
    useSessionStore.setState({ appStarted: false, selectedPersona: null, skipPersonaSurvey: false });
    return;
  }
  const n = normalizeHistState(st);
  if (n.route === 'home') {
    useSessionStore.setState({ appStarted: false, selectedPersona: null, skipPersonaSurvey: false });
    return;
  }
  const skipPersonaSurvey =
    n.route === 'survey' ? false : Boolean(n.defaultCoaching) || n.persona != null;
  useSessionStore.setState((prev) => ({
    appStarted: true,
    selectedPersona: n.persona ?? null,
    skipPersonaSurvey,
    session: {
      ...prev.session,
      status: n.status,
    },
  }));
}

/**
 * Keeps browser history in sync with in-app flow so the Back button steps
 * through Point (home → survey → prepare → …) instead of leaving the site.
 */
export function useAppHistorySync(enabled: boolean) {
  const fromPopRef = useRef(false);
  const lastRouteRef = useRef<AppRouteId | null>(null);
  const hydratedRef = useRef(false);

  const appStarted = useSessionStore((s) => s.appStarted);
  const selectedPersona = useSessionStore((s) => s.selectedPersona);
  const skipPersonaSurvey = useSessionStore((s) => s.skipPersonaSurvey);
  const status = useSessionStore((s) => s.session.status);

  useEffect(() => {
    if (!enabled) return;

    const onPop = () => {
      fromPopRef.current = true;
      const st = history.state as HistState | null;
      if (st && typeof st.route === 'string') {
        applyHistoryState(st);
        lastRouteRef.current = st.route;
        return;
      }
      const hashRoute = parseHashRoute();
      if (hashRoute === 'survey') {
        applyHistoryState({ route: 'survey', persona: null, status: 'IDLE' });
        lastRouteRef.current = 'survey';
        return;
      }
      if (hashRoute && hashRoute !== 'home') {
        applyHistoryState(null);
        lastRouteRef.current = 'home';
        return;
      }
      applyHistoryState(null);
      lastRouteRef.current = 'home';
    };

    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    if (!hydratedRef.current) {
      hydratedRef.current = true;
      const hashRoute = parseHashRoute();
      const st = history.state as HistState | null;
      if (st?.route && st.route !== 'home') {
        applyHistoryState(st);
        lastRouteRef.current = st.route;
        return;
      }
      if (hashRoute && hashRoute !== 'home' && hashRoute !== 'survey') {
        applyHistoryState(null);
        const homeState: HistState = { route: 'home', persona: null, status: 'IDLE' };
        history.replaceState(homeState, '', pathWithHash('home'));
        lastRouteRef.current = 'home';
        return;
      }
      if (hashRoute === 'survey') {
        applyHistoryState({ route: 'survey', persona: null, status: 'IDLE' });
        lastRouteRef.current = 'survey';
        return;
      }
    }

    if (fromPopRef.current) {
      fromPopRef.current = false;
      return;
    }

    const route = routeFromStore(appStarted, selectedPersona, status, skipPersonaSurvey);
    const state: HistState = {
      route,
      persona: selectedPersona,
      status,
      defaultCoaching: skipPersonaSurvey && selectedPersona === null,
    };

    if (lastRouteRef.current === route) {
      const want = pathWithHash(route);
      if (window.location.hash !== (route === 'home' ? '#/' : `#/${route}`)) {
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

    history.pushState(state, '', url);
  }, [enabled, appStarted, selectedPersona, skipPersonaSurvey, status]);
}
