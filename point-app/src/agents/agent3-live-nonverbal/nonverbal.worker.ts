/**
 * Agent 3 — Live Nonverbal (Web Worker)
 * MVP: Sends periodic demo nonverbal signals (replaced by PoseTracker in production).
 * Spec: ./AGENT.md
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
