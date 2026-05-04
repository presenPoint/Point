import { useEffect, useState, type ReactNode } from 'react';
import { useSessionStore } from './store/sessionStore';
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
  const setUserId           = useSessionStore((s) => s.setUserId);
  const startPersonaStyleQuiz     = useSessionStore((s) => s.startPersonaStyleQuiz);
  const startWithDefaultCoaching  = useSessionStore((s) => s.startWithDefaultCoaching);

  /** 랜딩 "시작하기" 버튼을 눌렀는지 여부 */
  const [landingDone, setLandingDone] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);

  useEffect(() => {
    if (user) setUserId(user.id);
  }, [user, setUserId]);

  /* 세션 리셋 시 랜딩으로 복귀 */
  useEffect(() => {
    if (!appStarted) setLandingDone(false);
  }, [appStarted]);

  /* 발표 시작 시 대시보드 닫기 */
  useEffect(() => {
    if (appStarted) setShowDashboard(false);
  }, [appStarted]);

  useAppHistorySync(!!user && !loading);

  /* ── 1단계: 랜딩 ── */
  if (!landingDone && !appStarted) {
    return (
      <>
        <CursorDot />
        <LandingScreen onStart={() => setLandingDone(true)} />
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
        userBar={userBar}
        userId={user.id}
        onBack={() => setLandingDone(false)}
        onShowDashboard={() => setShowDashboard(true)}
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
