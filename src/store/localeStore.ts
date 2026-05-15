import { create } from 'zustand';

const STORAGE_KEY = 'point-locale';

export type AppLocale = 'en' | 'ko';

function readInitialLocale(): AppLocale {
  if (typeof window === 'undefined') return 'en';
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'ko' || v === 'en') return v;
  } catch {
    /* ignore */
  }
  const nav = navigator.language?.toLowerCase() ?? 'en';
  return nav.startsWith('ko') ? 'ko' : 'en';
}

function persistLocale(locale: AppLocale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale === 'ko' ? 'ko' : 'en';
  }
}

interface LocaleState {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: readInitialLocale(),
  setLocale: (locale) => {
    persistLocale(locale);
    set({ locale });
  },
}));

/** Call once on app boot if store was created before document existed */
export function syncHtmlLangFromStorage() {
  persistLocale(readInitialLocale());
}
