/**
 * Agent 0 — Session Orchestrator
 * 상태 전이·세션 생명주기는 `store/sessionStore.ts`에서 처리합니다.
 * 역할·전이 규격: `./AGENT.md`
 */

export const SESSION_STATUS_FLOW = [
  'IDLE',
  'PRE_QUIZ',
  'PRESENTING',
  'POST_QA',
  'REPORT',
  'DONE',
] as const;
