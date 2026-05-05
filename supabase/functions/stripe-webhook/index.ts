// Edge Function: stripe-webhook
// Stripe 구독 이벤트를 받아 subscriptions 테이블 동기화.
//
// 등록할 이벤트 (Stripe Dashboard):
//   - customer.subscription.created
//   - customer.subscription.updated
//   - customer.subscription.deleted
//
// 환경변수:
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
//   STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_YEARLY
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import Stripe from 'https://esm.sh/stripe@14?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

type Plan = 'free' | 'pro_monthly' | 'pro_yearly';

function priceToPlan(priceId: string | null | undefined): Plan {
  const monthly = Deno.env.get('STRIPE_PRICE_PRO_MONTHLY');
  const yearly = Deno.env.get('STRIPE_PRICE_PRO_YEARLY');
  if (priceId && priceId === monthly) return 'pro_monthly';
  if (priceId && priceId === yearly) return 'pro_yearly';
  return 'free';
}

function statusFromStripe(s: string): string {
  switch (s) {
    case 'active':
    case 'trialing':
    case 'past_due':
    case 'canceled':
    case 'incomplete':
      return s;
    case 'incomplete_expired':
    case 'unpaid':
      return 'canceled';
    default:
      return 'incomplete';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');
  const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  if (!SUPABASE_URL || !SERVICE_KEY || !STRIPE_KEY || !WEBHOOK_SECRET) {
    return new Response('server_not_configured', { status: 500, headers: corsHeaders });
  }

  const stripe = new Stripe(STRIPE_KEY, { apiVersion: '2024-06-20' });
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('missing_signature', { status: 400, headers: corsHeaders });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, WEBHOOK_SECRET);
  } catch (err) {
    return new Response(`signature_verification_failed: ${(err as Error).message}`, {
      status: 400,
      headers: corsHeaders,
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

    // user_id를 customers 테이블에서 매핑
    const { data: customer } = await admin
      .from('customers')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();

    if (!customer) {
      // 매핑 없으면 metadata fallback
      const metaUserId = sub.metadata?.supabase_user_id;
      if (!metaUserId) {
        return new Response('user_not_found', { status: 200, headers: corsHeaders });
      }
      await admin.from('customers').insert({
        user_id: metaUserId,
        stripe_customer_id: customerId,
      });
    }

    const userId = customer?.user_id ?? sub.metadata?.supabase_user_id;
    if (!userId) {
      return new Response('user_not_found', { status: 200, headers: corsHeaders });
    }

    const priceId = sub.items.data[0]?.price.id;
    const plan: Plan = event.type === 'customer.subscription.deleted'
      ? 'free'
      : priceToPlan(priceId);
    const status = event.type === 'customer.subscription.deleted'
      ? 'canceled'
      : statusFromStripe(sub.status);

    await admin
      .from('subscriptions')
      .upsert({
        user_id: userId,
        plan: plan === 'free' ? 'free' : plan,
        status,
        stripe_subscription_id: event.type === 'customer.subscription.deleted' ? null : sub.id,
        current_period_end: sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null,
        cancel_at_period_end: sub.cancel_at_period_end ?? false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
