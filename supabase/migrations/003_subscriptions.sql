-- Point — Billing & Subscriptions
-- Stripe 연동 + 세션 시간 제한 강제용 컬럼/테이블

-- ── 1. Stripe 고객 매핑 (1:1) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  user_id            UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT UNIQUE NOT NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- 본인 row만 SELECT (write는 service_role만)
DROP POLICY IF EXISTS "customers_self_select" ON customers;
CREATE POLICY "customers_self_select"
  ON customers FOR SELECT
  USING (auth.uid() = user_id);

-- ── 2. 구독 상태 (단일 활성 구독 가정) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id                UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan                   TEXT NOT NULL DEFAULT 'free'
                         CHECK (plan IN ('free','pro_monthly','pro_yearly')),
  status                 TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','past_due','canceled','trialing','incomplete')),
  stripe_subscription_id TEXT UNIQUE,
  current_period_end     TIMESTAMPTZ,
  cancel_at_period_end   BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_self_select" ON subscriptions;
CREATE POLICY "subscriptions_self_select"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT/UPDATE/DELETE 정책 없음 → service_role(웹훅)만 쓰기 가능

-- ── 3. 신규 가입자에 free 구독 자동 생성 ────────────────────────────────────
CREATE OR REPLACE FUNCTION ensure_free_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_users_default_subscription ON users;
CREATE TRIGGER trg_users_default_subscription
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION ensure_free_subscription();

-- 기존 사용자에게도 free 구독 백필
INSERT INTO subscriptions (user_id, plan, status)
SELECT id, 'free', 'active' FROM users
ON CONFLICT (user_id) DO NOTHING;

-- ── 4. sessions 테이블 — 시간 제한 컬럼 추가 ────────────────────────────────
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS max_duration_sec INTEGER,
  ADD COLUMN IF NOT EXISTS ended_reason     TEXT
    CHECK (ended_reason IN ('user','time_limit','abandoned','error'));

-- 월별 사용량 빠른 조회 (Free 플랜 3회/월 카운트용)
CREATE INDEX IF NOT EXISTS idx_sessions_user_month
  ON sessions(user_id, started_at);

-- ── 5. (선택) 월 세션 수 헬퍼 뷰 ────────────────────────────────────────────
CREATE OR REPLACE VIEW user_monthly_session_count AS
SELECT
  user_id,
  date_trunc('month', started_at) AS month_start,
  COUNT(*) AS session_count
FROM sessions
WHERE started_at IS NOT NULL
GROUP BY user_id, date_trunc('month', started_at);

-- ── 6. 좀비 세션 자동 종료용 함수 (pg_cron 또는 Edge Function이 호출) ──────
-- max_duration + 5분(grace) 지났는데 ended_at이 비어있으면 abandoned 마감
CREATE OR REPLACE FUNCTION close_abandoned_sessions()
RETURNS INTEGER AS $$
DECLARE
  affected INTEGER;
BEGIN
  WITH closed AS (
    UPDATE sessions
       SET ended_at     = NOW(),
           ended_reason = 'abandoned'
     WHERE ended_at IS NULL
       AND started_at IS NOT NULL
       AND max_duration_sec IS NOT NULL
       AND NOW() > started_at + (max_duration_sec + 300) * INTERVAL '1 second'
     RETURNING 1
  )
  SELECT COUNT(*) INTO affected FROM closed;
  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
