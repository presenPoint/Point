import { useEffect } from 'react';
import { useEffectiveLocale } from './useEffectiveLocale';

/** document.lang을 현재 단계의 effective locale에 맞춤 */
export function useSyncHtmlLang() {
  const locale = useEffectiveLocale();
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale === 'ko' ? 'ko' : 'en';
    }
  }, [locale]);
}
