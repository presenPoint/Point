import { useSessionStore } from './store/sessionStore';
import { HomeScreen } from './components/HomeScreen';
import { UploadWorkspace } from './components/UploadWorkspace';
import { LiveSessionScreen } from './components/LiveSessionScreen';
import { QaReportScreen } from './components/QaReportScreen';

export default function App() {
  const appStarted = useSessionStore((s) => s.appStarted);
  const status = useSessionStore((s) => s.session.status);

  if (!appStarted) {
    return <HomeScreen />;
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
