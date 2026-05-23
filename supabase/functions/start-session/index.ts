// Edge Function: start-session
// Plan을 검증하고 max_duration_sec을 박제해 sessions 행을 생성한 뒤 클라이언트에 반환.
//
// Body: {} (현재 사용 안 함, 미래 확장용)
// Auth: caller's JWT (Authorization: Bearer ...)
// Response: { session_id, max_duration_sec, server_started_at, plan }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FREE_MAX_DURATION_SEC = 5 * 60;
const PRO_MAX_DURATION_SEC = 60 * 60;
const FREE_MONTHLY_SESSION_LIMIT = 3;

function maxDurationFor(plan: string, status: string): number {
  if ((plan === 'pro_monthly' || plan === 'pro_yearly') && (status === 'active' || status === 'trialing')) {
    return PRO_MAX_DURATION_SEC;
  }
  return FREE_MAX_DURATION_SEC;
}

/** sessions.user_id FK — 클라이언트 ensureUserProfile 실패 시에도 서버에서 보장 */
async function ensureUserRows(
  admin: ReturnType<typeof createClient>,
  userId: string,
  email: string | undefined,
): Promise<string | null> {
  const mail = (email ?? '').trim() || `${userId}@users.local`;
  const { error: userErr } = await admin.from('users').upsert({ id: userId, email: mail }, { onConflict: 'id' });
  if (userErr) return userErr.message;

  const { error: subErr } = await admin
    .from('subscriptions')
    .upsert({ user_id: userId, plan: 'free', status: 'active' }, { onConflict: 'user_id' });
  if (subErr) return subErr.message;

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'server_not_configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 호출자 JWT로 user 식별
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing_auth' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ error: 'invalid_token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const userId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const profileErr = await ensureUserRows(admin, userId, userData.user.email);
  if (profileErr) {
    console.error('[start-session] ensureUserRows failed', profileErr);
    return new Response(
      JSON.stringify({
        error: 'profile_ensure_failed',
        detail: profileErr,
        hint: 'Run supabase/migrations/003_subscriptions.sql and 005_users_self_upsert.sql in SQL Editor.',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const { data: sub } = await admin
    .from('subscriptions')
    .select('plan,status')
    .eq('user_id', userId)
    .maybeSingle();

  const plan = sub?.plan ?? 'free';
  const status = sub?.status ?? 'active';
  const maxSec = maxDurationFor(plan, status);

  // Free면 이번 달 세션 수 검증
  if (maxSec === FREE_MAX_DURATION_SEC) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const { count } = await admin
      .from('sessions')
      .select('session_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('started_at', monthStart.toISOString());
    if ((count ?? 0) >= FREE_MONTHLY_SESSION_LIMIT) {
      return new Response(
        JSON.stringify({
          error: 'monthly_limit_reached',
          message:
            'You have used all 3 Free sessions this month. Upgrade to Pro for unlimited sessions.',
        }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
  }

  // sessions 행 생성
  const serverStartedAt = new Date().toISOString();
  const { data: inserted, error: insertErr } = await admin
    .from('sessions')
    .insert({
      user_id: userId,
      started_at: serverStartedAt,
      status: 'PRESENTING',
      max_duration_sec: maxSec,
    })
    .select('session_id')
    .single();

  if (insertErr || !inserted) {
    return new Response(JSON.stringify({ error: 'session_create_failed', detail: insertErr?.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      session_id: inserted.session_id,
      max_duration_sec: maxSec,
      server_started_at: serverStartedAt,
      plan,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
