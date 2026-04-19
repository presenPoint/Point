# Agent 0 — Session Orchestrator (세션 관리자)

## 역할

모든 에이전트를 조율하는 중앙 에이전트입니다. 사용자가 "새 발표 시작"부터 리포트 저장까지 **전체 상태 머신**을 관리합니다.

## 상태 전이

```
IDLE
  → (파일 업로드 후 자료 분석·퀴즈 단계) PRE_QUIZ
  → (발표 시작) PRESENTING
  → (발표 종료 후 Q&A) POST_QA
  → (Q&A 완료·리포트 생성) REPORT
  → DONE
```

`SessionContext.status` 필드와 1:1로 맞춥니다.

## 책임

1. **단계 시작/종료 신호**: 각 단계에서 해당 하위 에이전트가 동작할 수 있도록 UI·스토어 상태를 전환합니다.
2. **`session_context` 누적**: 모든 에이전트 출력은 공유 `SessionContext`(Zustand)에 기록됩니다.
3. **비정상 종료 대비**: 브라우저 종료·네트워크 끊김 시 `localStorage`/Supabase 등으로 세션 스냅샷을 복구할 수 있도록 설계합니다. (구현은 앱 정책에 따름)

## 구현 위치

- 주 구현: `src/store/sessionStore.ts` (`transition`, `runMaterialAnalysis`, `submitPreQuiz`, `startQa`, `runReport` 등)
- 본 문서는 에이전트 행동 규격의 단일 참고본입니다.

## 하위 에이전트와의 관계

| 단계        | 활성 에이전트        |
|------------|----------------------|
| PRE_QUIZ   | Agent 1              |
| PRESENTING | Agent 2 + Agent 3    |
| POST_QA    | Agent 4              |
| REPORT     | Agent 5              |

## 출력

- 직접 GPT를 호출하지 않습니다.
- 세션 메타·각 에이전트가 채운 `SessionContext`가 최종 산출물입니다.
