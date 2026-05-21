import { supabase } from './supabase';

/** auth.users 로그인 후 public.users·subscriptions 행 보장 (FK·Free 플랜) */
export async function ensureUserProfile(userId: string, email: string | undefined): Promise<void> {
  if (!supabase || !userId) return;
  const mail = (email ?? '').trim() || `${userId}@users.local`;
  const { error } = await supabase.from('users').upsert(
    { id: userId, email: mail },
    { onConflict: 'id' },
  );
  if (error) {
    console.warn('[auth] ensureUserProfile failed', error);
  }
}
