-- Point — RLS policies for sessions (+ related tables) and security_invoker view
-- Resolves Supabase Advisor: user_monthly_session_count SECURITY DEFINER warning

-- ── 1. sessions: 본인 데이터만 (클라이언트 upsert·대시보드 조회) ─────────────
DROP POLICY IF EXISTS "sessions_own_select" ON sessions;
CREATE POLICY "sessions_own_select"
  ON sessions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "sessions_own_insert" ON sessions;
CREATE POLICY "sessions_own_insert"
  ON sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "sessions_own_update" ON sessions;
CREATE POLICY "sessions_own_update"
  ON sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "sessions_own_delete" ON sessions;
CREATE POLICY "sessions_own_delete"
  ON sessions FOR DELETE
  USING (auth.uid() = user_id);

-- ── 2. session_id로 묶인 자식 테이블 ───────────────────────────────────────
DROP POLICY IF EXISTS "files_own" ON files;
CREATE POLICY "files_own"
  ON files FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "speech_logs_own" ON speech_logs;
CREATE POLICY "speech_logs_own"
  ON speech_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.session_id = speech_logs.session_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.session_id = speech_logs.session_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "nonverbal_logs_own" ON nonverbal_logs;
CREATE POLICY "nonverbal_logs_own"
  ON nonverbal_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.session_id = nonverbal_logs.session_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.session_id = nonverbal_logs.session_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "qa_exchanges_own" ON qa_exchanges;
CREATE POLICY "qa_exchanges_own"
  ON qa_exchanges FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.session_id = qa_exchanges.session_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.session_id = qa_exchanges.session_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "reports_own" ON reports;
CREATE POLICY "reports_own"
  ON reports FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.session_id = reports.session_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.session_id = reports.session_id AND s.user_id = auth.uid()
    )
  );

-- ── 3. users 프로필 ───────────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_self_select" ON users;
CREATE POLICY "users_self_select"
  ON users FOR SELECT
  USING (auth.uid() = id);

-- ── 4. 월 세션 수 뷰: 호출자 권한(security_invoker) ─────────────────────────
DROP VIEW IF EXISTS public.user_monthly_session_count;

CREATE VIEW public.user_monthly_session_count
WITH (security_invoker = true)
AS
SELECT
  user_id,
  date_trunc('month', started_at AT TIME ZONE 'UTC') AS month_start,
  COUNT(*)::bigint AS session_count
FROM sessions
WHERE started_at IS NOT NULL
GROUP BY user_id, date_trunc('month', started_at AT TIME ZONE 'UTC');

COMMENT ON VIEW public.user_monthly_session_count IS
  'Per-user monthly session counts. security_invoker: respects sessions RLS (own rows only).';

REVOKE ALL ON public.user_monthly_session_count FROM PUBLIC;
GRANT SELECT ON public.user_monthly_session_count TO authenticated;
GRANT SELECT ON public.user_monthly_session_count TO service_role;

-- 클라이언트/Edge에서 안전하게 쓰는 RPC (선택)
CREATE OR REPLACE FUNCTION public.get_my_monthly_session_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT session_count::integer
      FROM public.user_monthly_session_count
      WHERE user_id = auth.uid()
        AND month_start = date_trunc('month', (now() AT TIME ZONE 'UTC'))
    ),
    0
  );
$$;

REVOKE ALL ON FUNCTION public.get_my_monthly_session_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_monthly_session_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_monthly_session_count() TO service_role;

-- ── 5. DEFINER 함수: search_path 고정 (Advisor 권장) ─────────────────────────
CREATE OR REPLACE FUNCTION ensure_free_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION close_abandoned_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;
