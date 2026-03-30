import { useSessionStore } from '../store/sessionStore';

export function HomeScreen() {
  const setAppStarted = useSessionStore((s) => s.setAppStarted);

  return (
    <div id="screen-home" className="point-screen screen-home">
      <div className="home-content">
        <div className="home-logo">Point</div>
        <div className="home-tagline">발표의 두려움을 AI가 해결합니다</div>
        <p className="home-sub">
          실시간 음성·비언어 코칭 · 발표 내용 사전 학습 · AI 질의응답
          <br />
          영상을 다시 볼 필요 없이, 발표하는 그 순간 피드백이 전달됩니다.
        </p>

        <div className="home-features">
          <div className="hf-chip">
            <span className="dot" style={{ background: 'var(--cyan)' }} />
            실시간 비언어 코칭
          </div>
          <div className="hf-chip">
            <span className="dot" style={{ background: 'var(--violet)' }} />
            발표 내용 사전 학습
          </div>
          <div className="hf-chip">
            <span className="dot" style={{ background: 'var(--green)' }} />
            AI 질의응답
          </div>
        </div>

        <button type="button" className="btn-start" onClick={() => setAppStarted(true)}>
          발표 시작하기 →
        </button>
      </div>
    </div>
  );
}
