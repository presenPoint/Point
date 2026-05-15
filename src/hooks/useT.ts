import { useCallback } from 'react';
import { useLocaleStore } from '../store/localeStore';
import { getMessage, type MessageKey } from '../locales/messages';

export function useT() {
  const locale = useLocaleStore((s) => s.locale);
  return useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => getMessage(locale, key, vars),
    [locale],
  );
}
