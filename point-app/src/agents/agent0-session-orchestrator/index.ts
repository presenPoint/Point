/**
 * Agent 0 — Session Orchestrator
 * State transitions and session lifecycle are managed in `store/sessionStore.ts`.
 * Spec: `./AGENT.md`
 */

export const SESSION_STATUS_FLOW = [
  'IDLE',
  'PRE_QUIZ',
  'PRESENTING',
  'POST_QA',
  'REPORT',
  'DONE',
] as const;
