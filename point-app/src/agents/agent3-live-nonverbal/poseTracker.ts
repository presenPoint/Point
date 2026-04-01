import { PoseLandmarker, FilesetResolver, type PoseLandmarkerResult } from '@mediapipe/tasks-vision';

export type PoseFrame = {
  type: 'FRAME';
  gaze: { isGazing: boolean; timestamp: number };
  posture: {
    angle: number;
    isStraight: boolean;
    isTooFar: boolean;
    isTooClose: boolean;
    timestamp: number;
  };
  gesture: { excess: boolean; lack: boolean };
};

type Landmark = { x: number; y: number; z: number; visibility?: number };

const FPS = 5;
const WRIST_MOVE_THRESHOLD = 0.06;
const SHOULDER_WIDTH_FAR = 0.08;
const SHOULDER_WIDTH_CLOSE = 0.45;
const STRAIGHT_ANGLE_THRESHOLD = 12;

let prevWrists: { left: Landmark; right: Landmark } | null = null;
let gestureExcessCount = 0;

function calcAngleDeg(a: Landmark, b: Landmark): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));
}

function isGazingAtCamera(nose: Landmark, leftShoulder: Landmark, rightShoulder: Landmark): boolean {
  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
  const offsetX = Math.abs(nose.x - shoulderMidX);
  return offsetX < 0.08;
}

function calcPosture(
  nose: Landmark,
  leftShoulder: Landmark,
  rightShoulder: Landmark,
  leftHip: Landmark,
  rightHip: Landmark,
): { angle: number; isStraight: boolean; isTooFar: boolean; isTooClose: boolean } {
  const shoulderAngle = calcAngleDeg(leftShoulder, rightShoulder);
  const deviation = Math.abs(shoulderAngle - 180);

  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipMidY = (leftHip.y + rightHip.y) / 2;
  const torsoTilt = Math.abs(nose.y - shoulderMidY) / Math.max(0.01, Math.abs(hipMidY - shoulderMidY));
  const isStraight = deviation < STRAIGHT_ANGLE_THRESHOLD && torsoTilt < 1.2;

  const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x);
  const isTooFar = shoulderWidth < SHOULDER_WIDTH_FAR;
  const isTooClose = shoulderWidth > SHOULDER_WIDTH_CLOSE;

  return { angle: deviation, isStraight, isTooFar, isTooClose };
}

function calcGesture(leftWrist: Landmark, rightWrist: Landmark): { excess: boolean; lack: boolean } {
  if (!prevWrists) {
    prevWrists = { left: leftWrist, right: rightWrist };
    return { excess: false, lack: false };
  }

  const leftMove = Math.hypot(leftWrist.x - prevWrists.left.x, leftWrist.y - prevWrists.left.y);
  const rightMove = Math.hypot(rightWrist.x - prevWrists.right.x, rightWrist.y - prevWrists.right.y);
  prevWrists = { left: leftWrist, right: rightWrist };

  const bigMove = leftMove > WRIST_MOVE_THRESHOLD || rightMove > WRIST_MOVE_THRESHOLD;
  if (bigMove) gestureExcessCount++;
  else gestureExcessCount = Math.max(0, gestureExcessCount - 1);

  return { excess: gestureExcessCount > 3, lack: false };
}

function extractFrame(result: PoseLandmarkerResult): PoseFrame | null {
  if (!result.landmarks || result.landmarks.length === 0) return null;
  const lm = result.landmarks[0];
  if (lm.length < 25) return null;

  const nose = lm[0];
  const leftShoulder = lm[11];
  const rightShoulder = lm[12];
  const leftHip = lm[23];
  const rightHip = lm[24];
  const leftWrist = lm[15];
  const rightWrist = lm[16];

  const t = Date.now();
  const gazing = isGazingAtCamera(nose, leftShoulder, rightShoulder);
  const posture = calcPosture(nose, leftShoulder, rightShoulder, leftHip, rightHip);
  const gesture = calcGesture(leftWrist, rightWrist);

  return {
    type: 'FRAME',
    gaze: { isGazing: gazing, timestamp: t },
    posture: { ...posture, timestamp: t },
    gesture,
  };
}

export class PoseTracker {
  private landmarker: PoseLandmarker | null = null;
  private rafId: number | null = null;
  private lastTick = 0;
  private running = false;
  private onFrame: ((frame: PoseFrame) => void) | null = null;

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );
    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numPoses: 1,
    });
  }

  start(video: HTMLVideoElement, callback: (frame: PoseFrame) => void): void {
    this.onFrame = callback;
    this.running = true;
    prevWrists = null;
    gestureExcessCount = 0;

    const loop = (): void => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(loop);

      const now = performance.now();
      if (now - this.lastTick < 1000 / FPS) return;
      this.lastTick = now;

      if (!this.landmarker || video.readyState < 2) return;

      try {
        const result = this.landmarker.detectForVideo(video, now);
        const frame = extractFrame(result);
        if (frame && this.onFrame) this.onFrame(frame);
      } catch {
        // skip frame on error
      }
    };

    loop();
  }

  stop(): void {
    this.running = false;
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.onFrame = null;
  }

  destroy(): void {
    this.stop();
    this.landmarker?.close();
    this.landmarker = null;
  }
}
