import { useCallback } from 'react';
import { getMessage, type MessageKey } from '../locales/messages';
import { useEffectiveLocale } from './useEffectiveLocale';

export function useT() {
  const locale = useEffectiveLocale();
  return useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => getMessage(locale, key, vars),
    [locale],
  );
}
