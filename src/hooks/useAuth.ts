import { useEffect, useState, useCallback } from 'react';
import { getOAuthRedirectTo } from '../lib/authRedirect';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

export function isInAppBrowser(): boolean {
  const ua = navigator.userAgent;
  // Google blocks OAuth from WebViews: KakaoTalk, Instagram, Line, Facebook, NAVER, etc.
  return /FBAN|FBAV|Instagram|Line\/|KAKAO|NaverApp|Snapchat|WeChat|MicroMessenger|Twitter|TikTok/i.test(ua);
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: getOAuthRedirectTo() },
    });
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  return { user, loading, signInWithGoogle, signOut };
}
