// Edge Function: create-checkout-session
// 호출자 plan 선택값을 받아 Stripe Checkout URL 생성.
//
// Body: { plan: 'pro_monthly' | 'pro_yearly', return_url: string }
// Auth: caller's JWT
// Response: { url }

import Stripe from 'https://esm.sh/stripe@14?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');
  const PRICE_MONTHLY = Deno.env.get('STRIPE_PRICE_PRO_MONTHLY');
  const PRICE_YEARLY = Deno.env.get('STRIPE_PRICE_PRO_YEARLY');

  if (!SUPABASE_URL || !SERVICE_KEY || !STRIPE_KEY || !PRICE_MONTHLY || !PRICE_YEARLY) {
    return new Response(JSON.stringify({ error: 'server_not_configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const stripe = new Stripe(STRIPE_KEY, { apiVersion: '2024-06-20' });

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
  const user = userData.user;

  let plan: 'pro_monthly' | 'pro_yearly' = 'pro_monthly';
  let returnUrl = SUPABASE_URL;
  try {
    const body = await req.json();
    if (body.plan === 'pro_monthly' || body.plan === 'pro_yearly') plan = body.plan;
    if (typeof body.return_url === 'string') returnUrl = body.return_url;
  } catch {
    /* 빈 바디 허용 */
  }

  const priceId = plan === 'pro_yearly' ? PRICE_YEARLY : PRICE_MONTHLY;

  // Stripe customer 조회 또는 생성
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: existing } = await admin
    .from('customers')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  let customerId = existing?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await admin.from('customers').insert({
      user_id: user.id,
      stripe_customer_id: customerId,
    });
  }

  const checkout = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${returnUrl}?checkout=success`,
    cancel_url: `${returnUrl}?checkout=cancel`,
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { supabase_user_id: user.id, plan },
    },
  });

  return new Response(JSON.stringify({ url: checkout.url }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
