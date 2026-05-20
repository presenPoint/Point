import { create } from 'zustand';
import type { AppRouteId } from '../lib/appNavigation';

const STORAGE_KEY = 'point-locale';
const ROUTE_STORAGE_KEY = 'point-locale-by-route';

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

function readLocaleByRoute(): Partial<Record<AppRouteId, AppLocale>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(ROUTE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Record<AppRouteId, AppLocale>>;
    const out: Partial<Record<AppRouteId, AppLocale>> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v === 'ko' || v === 'en') out[k as AppRouteId] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function persistLocale(locale: AppLocale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}

function persistLocaleByRoute(map: Partial<Record<AppRouteId, AppLocale>>) {
  try {
    localStorage.setItem(ROUTE_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function applyHtmlLang(locale: AppLocale) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale === 'ko' ? 'ko' : 'en';
  }
}

interface LocaleState {
  /** 새 단계 기본값(아직 이 단계에서 언어를 고르지 않았을 때) */
  locale: AppLocale;
  /** 화면(단계)마다 따로 저장한 언어 */
  localeByRoute: Partial<Record<AppRouteId, AppLocale>>;
  /** 기본값만 변경 — 이미 저장된 단계별 설정은 유지 */
  setLocale: (locale: AppLocale) => void;
  /** @deprecated — setLocaleEverywhere와 동일 (하위 호환) */
  setLocaleForRoute: (route: AppRouteId, locale: AppLocale) => void;
  /** 모든 단계 + 기본값을 한 번에 변경 */
  setLocaleEverywhere: (locale: AppLocale) => void;
}

export const useLocaleStore = create<LocaleState>((set, get) => ({
  locale: readInitialLocale(),
  localeByRoute: readLocaleByRoute(),

  setLocale: (locale) => {
    persistLocale(locale);
    set({ locale });
    applyHtmlLang(locale);
  },

  setLocaleForRoute: (_route, locale) => {
    get().setLocaleEverywhere(locale);
  },

  setLocaleEverywhere: (locale) => {
    persistLocale(locale);
    const allRoutes: AppRouteId[] = [
      'landing',
      'coach',
      'dashboard',
      'pricing',
      'survey',
      'mode',
      'prepare',
      'live',
      'report',
    ];
    const localeByRoute = Object.fromEntries(allRoutes.map((r) => [r, locale])) as Partial<
      Record<AppRouteId, AppLocale>
    >;
    persistLocaleByRoute(localeByRoute);
    set({ locale, localeByRoute });
    applyHtmlLang(locale);
  },
}));

/** 스토어 밖(에이전트 등) — 앱 전역 언어 */
export function resolveLocaleForCurrentApp(): AppLocale {
  return useLocaleStore.getState().locale;
}

export function localeForRoute(_route: AppRouteId): AppLocale {
  return useLocaleStore.getState().locale;
}

/** Call once on app boot */
export function syncHtmlLangFromStorage() {
  applyHtmlLang(resolveLocaleForCurrentApp());
}
