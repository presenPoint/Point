/** 구독 플랜. 'free'는 기본값, Stripe 연동 후 pro_* 가능. */
export type Plan = 'free' | 'pro_monthly' | 'pro_yearly';

export type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'trialing'
  | 'incomplete';

export interface Subscription {
  user_id: string;
  plan: Plan;
  status: SubscriptionStatus;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  updated_at: string;
}

/** Free 플랜 한도 — 클라이언트 표시용. 실제 강제는 서버에서. */
export const FREE_LIMITS = {
  maxDurationSec: 5 * 60,
  monthlySessions: 3,
  qaRounds: 1,
  reportRetentionDays: 7,
} as const;

/** Pro 플랜 — 실용적 cap (60분). null 무제한. */
export const PRO_LIMITS = {
  maxDurationSec: 60 * 60,
  monthlySessions: null,
  qaRounds: 5,
  reportRetentionDays: null,
} as const;

/** 플랜이 Pro 등급인지 (active/trialing 한정). */
export function isPro(sub: Subscription | null): boolean {
  if (!sub) return false;
  if (sub.plan === 'free') return false;
  return sub.status === 'active' || sub.status === 'trialing';
}

/** 플랜에 따른 세션 최대 시간(초). 클라이언트 카운트다운 표시 전용. */
export function maxDurationSecFor(sub: Subscription | null): number {
  return isPro(sub) ? PRO_LIMITS.maxDurationSec : FREE_LIMITS.maxDurationSec;
}
