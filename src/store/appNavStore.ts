import { create } from 'zustand';

export type PresentationMode = 'with-materials' | null;

interface AppNavState {
  landingDone: boolean;
  /** 로그인 후 서비스 소개(랜딩) 페이지 보기 */
  showMarketingHome: boolean;
  showDashboard: boolean;
  showPricing: boolean;
  presentationMode: PresentationMode;
  setLandingDone: (v: boolean) => void;
  setShowDashboard: (v: boolean) => void;
  setShowPricing: (v: boolean) => void;
  setPresentationMode: (m: PresentationMode) => void;
  openMarketingHome: () => void;
  enterCoachHome: () => void;
  resetAppNav: () => void;
}

export const useAppNavStore = create<AppNavState>((set) => ({
  landingDone: false,
  showMarketingHome: false,
  showDashboard: false,
  showPricing: false,
  presentationMode: null,
  setLandingDone: (v) => set({ landingDone: v }),
  setShowDashboard: (v) => set({ showDashboard: v }),
  setShowPricing: (v) => set({ showPricing: v }),
  setPresentationMode: (m) => set({ presentationMode: m }),
  openMarketingHome: () =>
    set({
      showMarketingHome: true,
      landingDone: false,
      showDashboard: false,
      showPricing: false,
      presentationMode: null,
    }),
  enterCoachHome: () =>
    set({
      showMarketingHome: false,
      landingDone: true,
      showDashboard: false,
      showPricing: false,
    }),
  resetAppNav: () =>
    set({
      landingDone: false,
      showMarketingHome: false,
      showDashboard: false,
      showPricing: false,
      presentationMode: null,
    }),
}));
