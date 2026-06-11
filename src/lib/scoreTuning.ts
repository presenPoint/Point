/**
 * 리포트 점수 보정 — coaching-friendly calibration.
 * 값만 바꿔도 전체 난이도를 조절할 수 있습니다.
 */
export const SCORE_TUNING = {
  /** 추임새 1회당 감점 (이전: 5) */
  fillerPenaltyPer: 2,
  /** 주제 이탈 1회당 감점 (이전: 15) */
  offTopicPenaltyPer: 8,
  /** 모호 표현 1회당 감점 (이전: 3) */
  ambiguousPenaltyPer: 2,
  /** 논리·흐름 단절(logic_break) 1회당 coherence 추가 감점 */
  logicBreakPenaltyPer: 10,

  /** 제스처 과다 1회당 감점 상한 내 단위 (이전: 8) */
  gestureExcessPenaltyPer: 5,
  /** 제스처 없음(동결) 감점 (이전: 30) */
  gestureFreezePenalty: 15,

  /** stiff 비율 기반 자세 감점 계수 (이전: 30) */
  postureStiffPenaltyScale: 18,
  /** restless 비율 기반 자세 감점 계수 (이전: 20) */
  postureRestlessPenaltyScale: 12,

  /**
   * 최종 카테고리 점수 리프트: liftBias + raw × liftScale (cap 100)
   * 예) raw 34 → 63, raw 46 → 73, raw 70 → 90
   */
  liftBias: 33,
  liftScale: 0.87,
} as const;

/** 원시 점수(0–100)를 코칭 리포트용으로 완만하게 올립니다. */
export function liftReportScore(raw: number): number {
  const n = Math.round(SCORE_TUNING.liftBias + raw * SCORE_TUNING.liftScale);
  return Math.max(0, Math.min(100, n));
}
