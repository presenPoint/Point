/**
 * Agent 3 — Live Nonverbal (Web Worker)
 * MVP: MediaPipe 대신 데모용 비언어 신호를 주기적으로 전송합니다.
 * 실제 배포 시 FaceMesh/Pose/Hands로 교체하면 됩니다.
 * 규격: ./AGENT.md
 */

type FromMain = { type: 'START' } | { type: 'STOP' };

const FPS_LIMIT = 5;
const interval = 1000 / FPS_LIMIT;

let timer: ReturnType<typeof setInterval> | null = null;

function tick(): void {
  const t = Date.now();
  const gazeOk = Math.random() > 0.35;
  self.postMessage({
    type: 'FRAME',
    gaze: { isGazing: gazeOk, timestamp: t },
    posture: {
      angle: (Math.random() - 0.5) * 8,
      isStraight: Math.random() > 0.2,
      isTooFar: false,
      isTooClose: false,
      timestamp: t,
    },
    gesture: { excess: Math.random() > 0.92, lack: false },
  });
}

self.onmessage = (ev: MessageEvent<FromMain>) => {
  if (ev.data.type === 'START') {
    if (timer) clearInterval(timer);
    timer = setInterval(tick, interval);
  }
  if (ev.data.type === 'STOP') {
    if (timer) clearInterval(timer);
    timer = null;
  }
};

export {};
