/** LiveSession 훅이 등록 — 세션 종료 직전에 미확정 전사를 저장 */
let flushFn: (() => void) | null = null;
let restartRecognitionFn: (() => void) | null = null;

export function registerLiveTranscriptFlush(fn: () => void): () => void {
  flushFn = fn;
  return () => {
    if (flushFn === fn) flushFn = null;
  };
}

export function flushLiveTranscriptNow(): void {
  flushFn?.();
}

export function registerLiveSpeechRecognitionRestart(fn: () => void): () => void {
  restartRecognitionFn = fn;
  return () => {
    if (restartRecognitionFn === fn) restartRecognitionFn = null;
  };
}

/** 마이크 연결·권한 후 Web Speech 인식 재시작 */
export function restartLiveSpeechRecognition(): void {
  restartRecognitionFn?.();
}
