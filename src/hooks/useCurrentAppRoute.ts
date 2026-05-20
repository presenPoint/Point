import { useMemo } from 'react';
import { computeAppRoute } from '../lib/appNavigation';
import type { AppRouteId } from '../lib/appNavigation';
import { useAppNavStore } from '../store/appNavStore';
import { useSessionStore } from '../store/sessionStore';

/** 현재 앱 화면(히스토리 단계) — 단계별 언어·라우팅에 공통 사용 */
export function useCurrentAppRoute(): AppRouteId {
  const landingDone = useAppNavStore((s) => s.landingDone);
  const showDashboard = useAppNavStore((s) => s.showDashboard);
  const showPricing = useAppNavStore((s) => s.showPricing);
  const presentationMode = useAppNavStore((s) => s.presentationMode);
  const appStarted = useSessionStore((s) => s.appStarted);
  const selectedPersona = useSessionStore((s) => s.selectedPersona);
  const skipPersonaSurvey = useSessionStore((s) => s.skipPersonaSurvey);
  const status = useSessionStore((s) => s.session.status);

  return useMemo(
    () =>
      computeAppRoute({
        landingDone,
        showDashboard,
        showPricing,
        appStarted,
        selectedPersona,
        skipPersonaSurvey,
        presentationMode,
        status,
      }),
    [
      landingDone,
      showDashboard,
      showPricing,
      appStarted,
      selectedPersona,
      skipPersonaSurvey,
      presentationMode,
      status,
    ],
  );
}
