import { useEffect, useState, useCallback } from 'react';
import { getOAuthRedirectTo } from '../lib/authRedirect';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

export function isInAppBrowser(): boolean {
  const ua = navigator.userAgent;
  return /FBAN|FBAV|Instagram|Line\/|KAKAO|NaverApp|Snapchat|WeChat|MicroMessenger|Twitter|TikTok/i.test(ua);
}

const AUTH_INIT_TIMEOUT_MS = 10_000;

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        setLoading(false);
      }
    };

    const timeoutId = window.setTimeout(finish, AUTH_INIT_TIMEOUT_MS);

    void supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null);
        finish();
      })
      .catch(() => finish());

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      finish();
    });

    return () => {
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: getOAuthRedirectTo() },
      });
      if (error) setLoading(false);
    } catch {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  return { user, loading, signInWithGoogle, signOut };
}
