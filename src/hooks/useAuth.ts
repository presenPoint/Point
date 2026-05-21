import { useEffect, useState, useCallback } from 'react';
import { getOAuthRedirectTo } from '../lib/authRedirect';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

export function isInAppBrowser(): boolean {
  const ua = navigator.userAgent;
  return /FBAN|FBAV|Instagram|Line\/|KAKAO|NaverApp|Snapchat|WeChat|MicroMessenger|Twitter|TikTok/i.test(ua);
}

const AUTH_INIT_TIMEOUT_MS = 15_000;

/** OAuth ?code= 쿼리 정리 (세션 교환 후 주소창 깔끔하게) */
function stripAuthQueryFromUrl() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const authKeys = ['code', 'state', 'error', 'error_description', 'error_code'];
  let changed = false;
  for (const key of authKeys) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (changed) {
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }
}

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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (
        event === 'INITIAL_SESSION' ||
        event === 'SIGNED_IN' ||
        event === 'SIGNED_OUT' ||
        event === 'TOKEN_REFRESHED'
      ) {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          stripAuthQueryFromUrl();
        }
        finish();
      }
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
