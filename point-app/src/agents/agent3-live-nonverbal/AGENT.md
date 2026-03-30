# Agent 3 — Live Nonverbal Coaching Agent (실시간 비언어 코칭)

## 활성화 시점

Agent 2와 동시에. **Web Worker**에서 독립 실행해 메인 스레드 블로킹을 피합니다.

## 처리 구조

- **MediaPipe** 목표: **5fps** (현재 MVP는 `nonverbal.worker.ts`에서 데모 신호 생성).
- Worker → 메인: `postMessage`로 프레임 결과만 전달.

## 시선 (FaceMesh 목표)

- 카메라 기준 좌우 **±15°** 이내를 "청중 응시"로 판정.
- **10초 슬라이딩 윈도우** 응시율 계산.
- 응시율 **60% 미만** → "청중을 좀 더 바라보세요".
- 응시 로그는 **30초마다** `session_context`에 기록(메인 훅의 `gaze_log` 누적과 정합).

## 자세 (Pose 목표)

- 어깨 기울기 **±10°** 이상 → "자세를 바르게 해주세요".
- 상체가 카메라에서 너무 멀거나 가까우면 각각 피드백.

## 제스처 (Hands + Pose 목표)

- **과다**: 손이 1초에 3회 이상 큰 이동(화면 1/4 이상) → "제스처가 너무 많아요".
- **부족**: **5분** 이상 손이 거의 안 움직임 → "제스처로 강조해보세요" (**INFO** 수준, 강요 느낌 완화).

## Agent 2와의 조율

- Agent 2 Rule Engine과 본 에이전트 피드백은 **`FeedbackQueue`** 로 통합.
- 우선순위·최대 2개 표시·쿨다운은 큐 구현을 따름.

## 출력 (`session_context`)

- `nonverbal_coaching.gaze_rate`, `gaze_log`, `posture_log`, `gesture_log`.

## 코드 매핑

- Worker: `nonverbal.worker.ts`
- 메인 스레드 소비: `hooks/useLivePresenting.ts`
