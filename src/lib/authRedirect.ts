/**
 * Google OAuth 완료 후 돌아올 URL (`signInWithOAuth` 의 `redirectTo`).
 *
 * Supabase 대시보드 → Authentication → URL Configuration → **Redirect URLs**에
 * 여기서 반환하는 문자열과 **완전히 동일한** 항목이 있어야 하며,
 * 없으면 **Site URL**(예: Vercel)로 보내질 수 있습니다.
 *
 * 로컬: `http://localhost:5173/` (포트는 `npm run dev` 출력에 맞춤)
 * 을 Redirect URLs에 추가하세요.
 */
export function getOAuthRedirectTo(): string {
  const fromEnv = import.meta.env.VITE_OAUTH_REDIRECT_URL?.trim();
  if (fromEnv) return fromEnv;
  const o = window.location.origin.replace(/\/+$/, '');
  return `${o}/`;
}
