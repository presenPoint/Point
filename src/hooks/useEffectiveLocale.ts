import { useLocaleStore } from '../store/localeStore';

/** 앱 전역 언어 (KO/EN 선택 시 모든 단계에 동일 적용) */
export function useEffectiveLocale() {
  return useLocaleStore((s) => s.locale);
}
