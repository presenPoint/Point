# Cross-Agent — FeedbackQueue

## 역할

Agent 2 (Rule / Semantic)와 Agent 3 (Nonverbal)이 동시에 피드백을 내도, 화면에는 **혼란을 주지 않도록** 중앙에서 조율합니다.

## 정책

- **최대 동시 표시**: 2개
- **우선순위**: `CRITICAL` > `WARN` > `INFO`
- **쿨다운**: 레벨·소스별로 `push` 시 중복 억제
- Agent 2 **Rule** 피드백은 Semantic과 충돌 시 정렬 상 항상 더 높은 우선순위가 되도록 `level`을 부여합니다 (동일 레벨이면 최신 순).

## 구현

- `feedbackQueue.ts` — 싱글톤 `feedbackQueue` 인스턴스

## 구독

- UI는 `subscribe`로 표시 목록(`getDisplayItems`)을 갱신합니다.
