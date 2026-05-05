import { supabase } from './supabase';
import type { Plan, Subscription } from '../types/billing';

/** 본인 구독 행 조회 (RLS로 자동 필터). 없으면 free 가정. */
export async function fetchSubscription(): Promise<Subscription | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .maybeSingle();
  if (error) {
    console.warn('[billing] fetchSubscription failed', error);
    return null;
  }
  return (data as Subscription | null) ?? null;
}

/** 이번 달 (UTC 기준) 본인 세션 수 — Free 3회 한도 검증용. */
export async function sessionsThisMonth(userId: string): Promise<number> {
  if (!supabase) return 0;
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from('sessions')
    .select('session_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('started_at', start.toISOString());
  if (error) {
    console.warn('[billing] sessionsThisMonth failed', error);
    return 0;
  }
  return count ?? 0;
}

/** Edge Function `start-session` 호출 — 서버 권위적 max_duration_sec 발급. */
export interface StartSessionResult {
  session_id: string;
  max_duration_sec: number | null;
  server_started_at: string;
  plan: Plan;
}

export async function startServerSession(): Promise<StartSessionResult | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke<StartSessionResult>('start-session', {
    body: {},
  });
  if (error) {
    console.warn('[billing] start-session failed', error);
    return null;
  }
  return data ?? null;
}

/** Stripe Checkout URL 생성 — Pro 플랜 결제. */
export async function createCheckoutSession(plan: 'pro_monthly' | 'pro_yearly'): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke<{ url: string }>('create-checkout-session', {
    body: { plan, return_url: window.location.origin },
  });
  if (error) {
    console.warn('[billing] create-checkout-session failed', error);
    return null;
  }
  return data?.url ?? null;
}
