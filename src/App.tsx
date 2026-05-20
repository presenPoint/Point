import { useEffect, type ReactNode } from 'react';

import { useSessionStore } from './store/sessionStore';

import { useAppNavStore } from './store/appNavStore';

import { useBillingStore } from './store/billingStore';

import { useAuth } from './hooks/useAuth';

import { useAppHistorySync } from './hooks/useAppHistorySync';

import { navigateBack } from './lib/appNavigation';

import { LoginScreen } from './components/LoginScreen';

import { LandingScreen } from './components/LandingScreen';

import { HomeScreen } from './components/HomeScreen';

import { DashboardScreen } from './components/DashboardScreen';

import { PersonaSurvey } from './components/PersonaSurvey';

import { UploadWorkspace } from './components/UploadWorkspace';

import { LiveSessionScreen } from './components/LiveSessionScreen';

import { QaReportScreen } from './components/QaReportScreen';

import { PresentationModeSelect } from './components/PresentationModeSelect';

import { PricingScreen } from './components/PricingScreen';

import { PointWordmark } from './components/PointWordmark';

import { CursorDot } from './components/CursorDot';

import { GlobalToast } from './components/GlobalToast';

import { AccountDeleteButton } from './components/AccountDeleteButton';

import { useT } from './hooks/useT';
import { useSyncHtmlLang } from './hooks/useSyncHtmlLang';



/**

 * 앱 플로우:

 *  랜딩 → "포인트 시작하기" → 로그인 → 코치 선택(Home) → 발표 준비(Upload) → 발표(Live) → 결과(QA)

 */

export default function App() {

  const t = useT();

  const { user, loading, signOut } = useAuth();

  const appStarted          = useSessionStore((s) => s.appStarted);

  const skipPersonaSurvey   = useSessionStore((s) => s.skipPersonaSurvey);

  const selectedPersona     = useSessionStore((s) => s.selectedPersona);

  const status              = useSessionStore((s) => s.session.status);

  const setUserId                 = useSessionStore((s) => s.setUserId);

  const startPersonaStyleQuiz     = useSessionStore((s) => s.startPersonaStyleQuiz);

  const startWithDefaultCoaching  = useSessionStore((s) => s.startWithDefaultCoaching);



  const landingDone       = useAppNavStore((s) => s.landingDone);

  const showDashboard     = useAppNavStore((s) => s.showDashboard);

  const showPricing       = useAppNavStore((s) => s.showPricing);

  const presentationMode  = useAppNavStore((s) => s.presentationMode);

  const setLandingDone    = useAppNavStore((s) => s.setLandingDone);

  const setShowDashboard  = useAppNavStore((s) => s.setShowDashboard);

  const setShowPricing    = useAppNavStore((s) => s.setShowPricing);

  const setPresentationMode = useAppNavStore((s) => s.setPresentationMode);

  const resetAppNav       = useAppNavStore((s) => s.resetAppNav);



  const refreshBilling = useBillingStore((s) => s.refresh);

  const resetBilling   = useBillingStore((s) => s.reset);

  const resetSession   = useSessionStore((s) => s.resetSession);



  const handleAccountDeleted = () => {

    resetSession();

    resetAppNav();

    resetBilling();

  };



  useEffect(() => {

    if (user) {

      setUserId(user.id);

      void refreshBilling();

    } else {

      resetBilling();

    }

  }, [user, setUserId, refreshBilling, resetBilling]);



  /* 발표 플로우 종료 시 자료 모드만 초기화 (랜딩으로 점프하지 않음) */

  useEffect(() => {

    if (!appStarted) {

      setPresentationMode(null);

    }

  }, [appStarted, setPresentationMode]);



  /* 발표 시작 시 대시보드 닫기 */

  useEffect(() => {

    if (appStarted) setShowDashboard(false);

  }, [appStarted, setShowDashboard]);



  useAppHistorySync(true);
  useSyncHtmlLang();



  /* ── Pricing 오버레이 — 어떤 단계에서든 띄움 ── */

  if (showPricing) {

    return (

      <>

        <CursorDot />

        <GlobalToast />

        <PricingScreen onBack={() => setShowPricing(false)} />

      </>

    );

  }



  /* ── 1단계: 랜딩 ── */

  if (!landingDone && !appStarted) {

    return (

      <>

        <CursorDot />

        <LandingScreen

          onStart={() => setLandingDone(true)}

          userName={user ? (user.user_metadata?.full_name as string | undefined ?? user.email) : undefined}

          userAvatar={user ? (user.user_metadata?.avatar_url as string | undefined) : undefined}

          userId={user?.id}

          isAuthLoading={loading}

          onSignOut={user ? signOut : undefined}

          onAccountDeleted={user ? handleAccountDeleted : undefined}

          onShowDashboard={user ? () => { setLandingDone(true); setShowDashboard(true); } : undefined}

          onShowPricing={() => setShowPricing(true)}

        />

      </>

    );

  }



  /* ── 2단계: 인증 로딩 ── */

  if (loading) {

    return (

      <>

        <CursorDot />

        <main className="login-screen">

          <div className="login-card">

            <h1 className="login-logo">

              <PointWordmark

                className="login-logo-mark"

                ariaLabel="Point — Home"

                onHomeClick={() => navigateBack()}

              />

            </h1>

            <p className="login-tagline">Loading…</p>

          </div>

        </main>

      </>

    );

  }



  /* ── 3단계: 미로그인 → 로그인 화면 ── */

  if (!user) {

    return (

      <>

        <CursorDot />

        <LoginScreen onLogoHome={() => navigateBack()} />

      </>

    );

  }



  /* ── 4단계: 코치 선택 → 발표 플로우 ── */

  const userBar: ReactNode = (

    <div className="user-bar">

      {user.user_metadata?.avatar_url && (

        <img

          className="user-avatar"

          src={user.user_metadata.avatar_url}

          alt=""

          referrerPolicy="no-referrer"

        />

      )}

      <span className="user-name">

        {user.user_metadata?.full_name ?? user.email}

      </span>

      <button type="button" className="btn-sign-out" onClick={signOut}>

        {t('nav.signOut')}

      </button>

      <AccountDeleteButton className="btn-account-delete-inline" onDeleted={handleAccountDeleted} />

    </div>

  );



  let screen: ReactNode;



  if (!appStarted && showDashboard) {

    screen = (

      <DashboardScreen

        userId={user.id}

        userName={user.user_metadata?.full_name as string | undefined ?? user.email}

        userAvatar={user.user_metadata?.avatar_url as string | undefined}

        onBack={() => navigateBack()}

      />

    );

  } else if (!appStarted) {

    screen = (

      <HomeScreen

        userName={user.user_metadata?.full_name as string | undefined ?? user.email}

        userAvatar={user.user_metadata?.avatar_url as string | undefined}

        userId={user.id}

        onBack={() => navigateBack()}

        onSignOut={signOut}

        onAccountDeleted={handleAccountDeleted}

        onShowDashboard={() => setShowDashboard(true)}

        onShowPricing={() => setShowPricing(true)}

        startPersonaStyleQuiz={startPersonaStyleQuiz}

        startWithDefaultCoaching={startWithDefaultCoaching}

      />

    );

  } else if (!selectedPersona && !skipPersonaSurvey) {

    screen = <PersonaSurvey />;

  } else if (status === 'PRESENTING') {

    screen = <LiveSessionScreen />;

  } else if (status === 'POST_QA' || status === 'REPORT' || status === 'DONE') {

    screen = <QaReportScreen />;

  } else if (!presentationMode) {

    screen = (

      <PresentationModeSelect

        userBar={userBar}

        onSelectWithMaterials={() => setPresentationMode('with-materials')}

      />

    );

  } else {

    screen = <UploadWorkspace />;

  }



  return (

    <>

      <CursorDot />

      <GlobalToast />

      {screen}

    </>

  );

}


