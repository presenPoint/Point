import { supabase } from './supabase';
import type { Plan, Subscription } from '../types/billing';

/**
 * Edge Function 미배포·로컬 preview 시 OPTIONS가 502/404 → 브라우저 CORS 오류로 보임.
 * 로컬/DEV 또는 VITE_DISABLE_EDGE_SESSION=1 이면 invoke 생략(클라이언트 폴백).
 */
export function shouldInvokeEdgeFunctions(): boolean {
  if (!supabase) return false;
  if (import.meta.env.VITE_DISABLE_EDGE_SESSION === '1') return false;
  if (import.meta.env.VITE_ENABLE_EDGE_SESSION === '1') return true;
  if (import.meta.env.DEV) return false;
  if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return false;
  }
  return import.meta.env.PROD;
}

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
  if (!shouldInvokeEdgeFunctions()) return null;
  try {
    const { data, error } = await supabase!.functions.invoke<StartSessionResult>('start-session', {
      body: {},
    });
    if (error) {
      console.info(
        '[billing] start-session unavailable — using client session limits. Deploy: supabase functions deploy start-session',
        error,
      );
      return null;
    }
    return data ?? null;
  } catch (e) {
    console.info('[billing] start-session skipped (network/CORS)', e);
    return null;
  }
}

/** Stripe Checkout URL 생성 — Pro 플랜 결제. */
export async function createCheckoutSession(plan: 'pro_monthly' | 'pro_yearly'): Promise<string | null> {
  if (!shouldInvokeEdgeFunctions()) {
    console.info('[billing] Checkout edge function disabled on this host. Set VITE_ENABLE_EDGE_SESSION=1 after deploy.');
    return null;
  }
  try {
    const { data, error } = await supabase!.functions.invoke<{ url: string }>('create-checkout-session', {
      body: { plan, return_url: window.location.origin },
    });
    if (error) {
      console.warn('[billing] create-checkout-session failed', error);
      return null;
    }
    return data?.url ?? null;
  } catch (e) {
    console.warn('[billing] create-checkout-session network error', e);
    return null;
  }
}
