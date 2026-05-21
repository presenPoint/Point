-- 로그인 시 클라이언트가 public.users 행을 upsert 할 수 있게 (auth → users FK)

DROP POLICY IF EXISTS "users_self_insert" ON users;
CREATE POLICY "users_self_insert"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "users_self_update" ON users;
CREATE POLICY "users_self_update"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
