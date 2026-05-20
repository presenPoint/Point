/**
 * Edge Function: delete-account
 * 본인 계정 및 연관 데이터 삭제 후 Supabase Auth 사용자 제거.
 * Auth: caller JWT (Authorization: Bearer ...)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=denonext';
import { corsHeaders } from '../_shared/cors.ts';

async function deleteUserData(admin: ReturnType<typeof createClient>, userId: string) {
  const { data: sessions } = await admin.from('sessions').select('session_id').eq('user_id', userId);
  const sessionIds = (sessions ?? []).map((r) => r.session_id as string);

  for (const sessionId of sessionIds) {
    await admin.from('qa_exchanges').delete().eq('session_id', sessionId);
    await admin.from('reports').delete().eq('session_id', sessionId);
    await admin.from('speech_logs').delete().eq('session_id', sessionId);
    await admin.from('nonverbal_logs').delete().eq('session_id', sessionId);
    await admin.from('quiz_items').delete().eq('session_id', sessionId);
  }

  await admin.from('sessions').delete().eq('user_id', userId);
  await admin.from('files').delete().eq('user_id', userId);
  await admin.from('script_chunks').delete().eq('user_id', userId);
  await admin.from('users').delete().eq('id', userId);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'server_not_configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

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

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (stripeKey) {
      const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
      const { data: sub } = await admin
        .from('subscriptions')
        .select('stripe_subscription_id, status')
        .eq('user_id', userId)
        .maybeSingle();
      if (sub?.stripe_subscription_id && sub.status !== 'canceled') {
        try {
          await stripe.subscriptions.cancel(sub.stripe_subscription_id);
        } catch (e) {
          console.warn('[delete-account] stripe cancel failed', e);
        }
      }
    }

    await deleteUserData(admin, userId);

    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      return new Response(JSON.stringify({ error: 'auth_delete_failed', detail: delErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: 'delete_failed', detail }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
