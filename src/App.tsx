import { useEffect } from 'react';
import { useSessionStore } from './store/sessionStore';
import { useAuth } from './hooks/useAuth';
import { useAppHistorySync } from './hooks/useAppHistorySync';
import { LoginScreen } from './components/LoginScreen';
import { HomeScreen } from './components/HomeScreen';
import { PersonaSurvey } from './components/PersonaSurvey';
import { UploadWorkspace } from './components/UploadWorkspace';
import { LiveSessionScreen } from './components/LiveSessionScreen';
import { QaReportScreen } from './components/QaReportScreen';

export default function App() {
  const { user, loading, signOut } = useAuth();
  const appStarted = useSessionStore((s) => s.appStarted);
  const selectedPersona = useSessionStore((s) => s.selectedPersona);
  const status = useSessionStore((s) => s.session.status);
  const setUserId = useSessionStore((s) => s.setUserId);

  useEffect(() => {
    if (user) setUserId(user.id);
  }, [user, setUserId]);

  useAppHistorySync(!!user && !loading);

  if (loading) {
    return (
      <main className="login-screen">
        <div className="login-card">
          <h1 className="login-logo">Point</h1>
          <p className="login-tagline">Loading…</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  const userBar = (
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

  if (!appStarted) {
    return <HomeScreen userBar={userBar} userId={user.id} />;
  }

  if (!selectedPersona) {
    return <PersonaSurvey />;
  }

  if (status === 'IDLE' || status === 'PRE_QUIZ') {
    return <UploadWorkspace />;
  }

  if (status === 'PRESENTING') {
    return <LiveSessionScreen />;
  }

  if (status === 'POST_QA' || status === 'REPORT' || status === 'DONE') {
    return <QaReportScreen />;
  }

  return <UploadWorkspace />;
}
