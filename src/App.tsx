import { useEffect, useState, type ReactNode } from 'react';
import { useSessionStore } from './store/sessionStore';
import { useBillingStore } from './store/billingStore';
import { useAuth } from './hooks/useAuth';
import { useAppHistorySync } from './hooks/useAppHistorySync';
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

/**
 * 앱 플로우:
 *  랜딩 → "포인트 시작하기" → 로그인 → 코치 선택(Home) → 발표 준비(Upload) → 발표(Live) → 결과(QA)
 */
export default function App() {
  const { user, loading, signOut } = useAuth();
  const appStarted          = useSessionStore((s) => s.appStarted);
  const skipPersonaSurvey   = useSessionStore((s) => s.skipPersonaSurvey);
  const selectedPersona     = useSessionStore((s) => s.selectedPersona);
  const status              = useSessionStore((s) => s.session.status);
  const setUserId                 = useSessionStore((s) => s.setUserId);
  const setAppStarted             = useSessionStore((s) => s.setAppStarted);
  const startPersonaStyleQuiz     = useSessionStore((s) => s.startPersonaStyleQuiz);
  const startWithDefaultCoaching  = useSessionStore((s) => s.startWithDefaultCoaching);

  /** 랜딩 "시작하기" 버튼을 눌렀는지 여부 */
  const [landingDone, setLandingDone] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  /** null = 아직 선택 전, 'with-materials' = 자료 업로드 흐름 */
  const [presentationMode, setPresentationMode] = useState<'with-materials' | null>(null);

  const refreshBilling = useBillingStore((s) => s.refresh);
  const resetBilling   = useBillingStore((s) => s.reset);

  useEffect(() => {
    if (user) {
      setUserId(user.id);
      void refreshBilling();
    } else {
      resetBilling();
    }
  }, [user, setUserId, refreshBilling, resetBilling]);

  /* 세션 리셋 시 랜딩으로 복귀 */
  useEffect(() => {
    if (!appStarted) {
      setLandingDone(false);
      setPresentationMode(null);
    }
  }, [appStarted]);

  /* 발표 시작 시 대시보드 닫기 */
  useEffect(() => {
    if (appStarted) setShowDashboard(false);
  }, [appStarted]);

  useAppHistorySync(!!user && !loading);

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
                onHomeClick={() => setLandingDone(false)}
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
        <LoginScreen onLogoHome={() => setLandingDone(false)} />
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
        Sign out
      </button>
    </div>
  );

  let screen: ReactNode;

  if (!appStarted && showDashboard) {
    screen = (
      <DashboardScreen
        userId={user.id}
        userName={user.user_metadata?.full_name as string | undefined ?? user.email}
        userAvatar={user.user_metadata?.avatar_url as string | undefined}
        onBack={() => setShowDashboard(false)}
      />
    );
  } else if (!appStarted) {
    /* 코치 선택 화면 */
    screen = (
      <HomeScreen
        userName={user.user_metadata?.full_name as string | undefined ?? user.email}
        userAvatar={user.user_metadata?.avatar_url as string | undefined}
        userId={user.id}
        onBack={() => setLandingDone(false)}
        onSignOut={signOut}
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
    /* 발표 방식 선택: 자료 업로드 vs 바로 발표 시작 */
    screen = (
      <PresentationModeSelect
        userBar={userBar}
        onBack={() => setAppStarted(false)}
        onSelectWithMaterials={() => setPresentationMode('with-materials')}
      />
    );
  } else {
    /* IDLE / PRE_QUIZ → 발표 준비 */
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
