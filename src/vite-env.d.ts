/// <reference types="vite/client" />

declare module '*.md?raw' {
  const content: string;
  export default content;
}

interface ImportMetaEnv {
  readonly VITE_OPENAI_API_KEY?: string;
  /** 로컬에서만: `1`이면 `/api/openai` 프록시 사용. 프로덕션 빌드는 기본으로 프록시 사용. */
  readonly VITE_OPENAI_SERVER_PROXY?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** 로컬 OAuth 복귀 주소. 비우면 `origin/` 사용. Supabase Redirect URLs와 일치해야 함 */
  readonly VITE_OAUTH_REDIRECT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
