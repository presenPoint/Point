# Billing 설정 가이드

Point의 Free / Pro 구독을 동작시키기 위한 일회성 설정 절차입니다.

## 1. SQL 마이그레이션 적용

`supabase/migrations/003_subscriptions.sql`을 Supabase SQL Editor에 그대로 붙여넣고 실행합니다.

생성되는 것:

- `customers` 테이블 (user ↔ stripe_customer_id 매핑)
- `subscriptions` 테이블 (plan, status, period 등)
- `sessions.max_duration_sec`, `sessions.ended_reason` 컬럼
- 신규 사용자 자동 free 구독 트리거 (+ 기존 사용자 백필)
- `close_abandoned_sessions()` 함수 (좀비 세션 정리용)

검증:

```sql
SELECT user_id, plan, status FROM subscriptions LIMIT 5;
```

## 2. Stripe 대시보드 설정

1. **Test mode**로 시작합니다.
2. Products → Add product:
   - 이름 `Point Pro`
   - 가격 추가 — 두 개:
     - `$9.99 USD / month` (recurring monthly) → `STRIPE_PRICE_PRO_MONTHLY` 가 됩니다
     - `$79.00 USD / year` (recurring yearly) → `STRIPE_PRICE_PRO_YEARLY` 가 됩니다
3. Developers → API keys에서 **Secret key** 복사 → `STRIPE_SECRET_KEY`
4. Developers → Webhooks → Add endpoint:
   - URL: `https://<PROJECT-REF>.supabase.co/functions/v1/stripe-webhook`
   - Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - 생성 후 노출되는 Signing secret 복사 → `STRIPE_WEBHOOK_SECRET`

## 3. Supabase 환경변수 (Edge Function용)

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set STRIPE_PRICE_PRO_MONTHLY=price_...
supabase secrets set STRIPE_PRICE_PRO_YEARLY=price_...
```

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`는 Supabase Functions 런타임에 자동 주입됩니다.

## 4. Edge Functions 배포

Supabase CLI 로그인 후:

```bash
supabase functions deploy start-session
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook --no-verify-jwt
```

`stripe-webhook`은 Stripe가 직접 호출하므로 JWT 인증을 끕니다 (서명 검증으로 보안 확보).

다른 둘은 사용자 JWT가 필요하므로 기본 verify-jwt를 유지합니다.

## 5. 좀비 세션 정리 (선택)

`close_abandoned_sessions()`는 발표가 끝나지 않은 (탭 닫힘 등) 세션을 마감하는 함수입니다.
주기적 실행을 원하면 Supabase Database → Cron(pg_cron 확장)에 등록:

```sql
SELECT cron.schedule(
  'close-abandoned-sessions',
  '*/5 * * * *',
  $$ SELECT close_abandoned_sessions(); $$
);
```

## 6. 동작 확인 체크리스트

- [ ] 새 가입자 row가 `subscriptions`에 free로 자동 생성되는지
- [ ] Pricing 화면 → Upgrade 클릭 → Stripe Checkout 으로 이동
- [ ] 결제 완료 후 `?checkout=success` 로 복귀, `subscriptions.plan`이 `pro_monthly`/`pro_yearly`로 갱신
- [ ] Free 사용자: 발표 5분에서 자동 종료 + 토스트
- [ ] Pro 사용자: 60분까지 발표 가능
- [ ] Stripe Dashboard에서 구독 cancel → webhook 후 plan이 free로 복귀

## 7. 프론트 환경변수

`.env.local`에 다음이 이미 있어야 합니다:

```
VITE_SUPABASE_URL=https://<PROJECT-REF>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

추가 환경변수는 필요 없습니다 — 클라이언트는 supabase-js의 `functions.invoke()`로 호출합니다.

## 8. Production 전환

- Stripe Dashboard 우상단 **Test → Live** 토글 후, 같은 product/price를 Live mode에 다시 만듭니다 (Live key/Price ID는 별개).
- `supabase secrets set` 으로 live 값으로 교체.
- Webhook endpoint도 live mode에서 다시 등록.

## 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| Pricing → Upgrade 클릭이 무반응 | Edge Function 미배포 또는 `STRIPE_PRICE_*` 미설정 | `supabase functions list`로 배포 확인 + secrets 확인 |
| webhook 401 | `--no-verify-jwt` 누락 | `supabase functions deploy stripe-webhook --no-verify-jwt` 다시 |
| webhook signature_verification_failed | `STRIPE_WEBHOOK_SECRET` 불일치 | Stripe Dashboard에서 endpoint signing secret 다시 복사 |
| start-session 5분 박제 안 됨 | 마이그레이션 미적용 | `subscriptions` 테이블 존재 여부 확인 |
