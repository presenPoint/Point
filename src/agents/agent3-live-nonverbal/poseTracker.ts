import { PoseLandmarker, FilesetResolver, type PoseLandmarkerResult } from '@mediapipe/tasks-vision';

/** `@mediapipe/tasks-vision` 패키지 버전과 맞춤 — `@latest` WASM과 불일치 시 경고·동작 차이 방지 */
const VISION_WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm';
import type { GazeSensitivity } from '../../constants/personas';

export type DynamismLevel = 'stiff' | 'natural' | 'restless';

export interface NonverbalConfig {
  gazeOffsetThreshold: number;
  wristMoveThreshold: number;
  gestureExcessLimit: number;
}

export function getDefaultNonverbalConfig(): NonverbalConfig {
  return { gazeOffsetThreshold: 0.08, wristMoveThreshold: 0.06, gestureExcessLimit: 3 };
}

export function nonverbalConfigFromPersona(
  gazeSensitivity: GazeSensitivity,
  gestureIntensity: number,
): NonverbalConfig {
  const gazeOffsetThreshold = gazeSensitivity === 'high' ? 0.06 : gazeSensitivity === 'mid' ? 0.08 : 0.12;
  const wristMoveThreshold = 0.03 + (1 - gestureIntensity) * 0.06;
  const gestureExcessLimit = Math.round(2 + (1 - gestureIntensity) * 4);
  return { gazeOffsetThreshold, wristMoveThreshold, gestureExcessLimit };
}

export type PoseFrame = {
  type: 'FRAME';
  gaze: { isGazing: boolean; direction: 'center' | 'left' | 'right'; timestamp: number };
  posture: {
    angle: number;
    isStraight: boolean;
    isTooFar: boolean;
    isTooClose: boolean;
    timestamp: number;
  };
  gesture: { excess: boolean; lack: boolean };
  dynamism: DynamismLevel;
};

type Landmark = { x: number; y: number; z: number; visibility?: number };

const FPS = 5;
// Default wrist threshold used by getDefaultNonverbalConfig()
const SHOULDER_WIDTH_FAR = 0.08;
const SHOULDER_WIDTH_CLOSE = 0.45;
const STRAIGHT_ANGLE_THRESHOLD = 12;

let prevWrists: { left: Landmark; right: Landmark } | null = null;
let gestureExcessCount = 0;
let activeConfig: NonverbalConfig = getDefaultNonverbalConfig();

const DYNAMISM_WINDOW = 15;
const bodyMovementBuffer: number[] = [];
const BODY_MOVE_NATURAL_MIN = 0.008;
const BODY_MOVE_RESTLESS_MAX = 0.05;
let prevNose: Landmark | null = null;
let prevShoulderMid: { x: number; y: number } | null = null;

function calcAngleDeg(a: Landmark, b: Landmark): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));
}

function getGazeInfo(
  nose: Landmark,
  leftShoulder: Landmark,
  rightShoulder: Landmark,
): { isGazing: boolean; direction: 'center' | 'left' | 'right' } {
  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
  const offsetX = nose.x - shoulderMidX;
  if (Math.abs(offsetX) < activeConfig.gazeOffsetThreshold) {
    return { isGazing: true, direction: 'center' };
  }
  // offsetX < 0: nose is left of shoulder center (image space)
  return { isGazing: false, direction: offsetX < 0 ? 'left' : 'right' };
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

  const bigMove = leftMove > activeConfig.wristMoveThreshold || rightMove > activeConfig.wristMoveThreshold;
  if (bigMove) gestureExcessCount++;
  else gestureExcessCount = Math.max(0, gestureExcessCount - 1);

  return { excess: gestureExcessCount > activeConfig.gestureExcessLimit, lack: false };
}

function calcDynamism(
  nose: Landmark,
  leftShoulder: Landmark,
  rightShoulder: Landmark,
): DynamismLevel {
  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;

  if (prevNose && prevShoulderMid) {
    const noseMove = Math.hypot(nose.x - prevNose.x, nose.y - prevNose.y);
    const shoulderMove = Math.hypot(shoulderMidX - prevShoulderMid.x, shoulderMidY - prevShoulderMid.y);
    const totalMove = (noseMove + shoulderMove) / 2;
    bodyMovementBuffer.push(totalMove);
  }

  prevNose = nose;
  prevShoulderMid = { x: shoulderMidX, y: shoulderMidY };

  if (bodyMovementBuffer.length > DYNAMISM_WINDOW) {
    bodyMovementBuffer.shift();
  }

  if (bodyMovementBuffer.length < 5) return 'natural';

  const avg = bodyMovementBuffer.reduce((a, b) => a + b, 0) / bodyMovementBuffer.length;

  if (avg < BODY_MOVE_NATURAL_MIN) return 'stiff';
  if (avg > BODY_MOVE_RESTLESS_MAX) return 'restless';
  return 'natural';
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
  const gazeInfo = getGazeInfo(nose, leftShoulder, rightShoulder);
  const posture = calcPosture(nose, leftShoulder, rightShoulder, leftHip, rightHip);
  const gesture = calcGesture(leftWrist, rightWrist);
  const dynamism = calcDynamism(nose, leftShoulder, rightShoulder);

  return {
    type: 'FRAME',
    gaze: { isGazing: gazeInfo.isGazing, direction: gazeInfo.direction, timestamp: t },
    posture: { ...posture, timestamp: t },
    gesture,
    dynamism,
  };
}

export class PoseTracker {
  private landmarker: PoseLandmarker | null = null;
  private rafId: number | null = null;
  private lastTick = 0;
  private running = false;
  private onFrame: ((frame: PoseFrame) => void) | null = null;

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(VISION_WASM_ROOT);
    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numPoses: 1,
    });
  }

  start(video: HTMLVideoElement, callback: (frame: PoseFrame) => void, config?: NonverbalConfig): void {
    if (config) activeConfig = config;
    this.onFrame = callback;
    this.running = true;
    prevWrists = null;
    gestureExcessCount = 0;
    prevNose = null;
    prevShoulderMid = null;
    bodyMovementBuffer.length = 0;

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
