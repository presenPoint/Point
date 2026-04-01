import { useSessionStore } from '../store/sessionStore';

export function HomeScreen() {
  const setAppStarted = useSessionStore((s) => s.setAppStarted);

  return (
    <main id="screen-home" className="point-screen screen-home" role="main">
      <div className="home-content">
        <h1 className="home-logo">Point</h1>
        <p className="home-tagline">발표의 두려움을 AI가 해결합니다</p>
        <p className="home-sub">
          실시간 음성·비언어 코칭 · 발표 내용 사전 학습 · AI 질의응답
          <br />
          영상을 다시 볼 필요 없이, 발표하는 그 순간 피드백이 전달됩니다.
        </p>

        <ul className="home-features" aria-label="주요 기능">
          <li className="hf-chip">
            <span className="dot dot-cyan" aria-hidden="true" />
            실시간 비언어 코칭
          </li>
          <li className="hf-chip">
            <span className="dot dot-violet" aria-hidden="true" />
            발표 내용 사전 학습
          </li>
          <li className="hf-chip">
            <span className="dot dot-green" aria-hidden="true" />
            AI 질의응답
          </li>
        </ul>

        <button type="button" className="btn-start" onClick={() => setAppStarted(true)}>
          발표 시작하기 →
        </button>
      </div>
    </main>
  );
}
