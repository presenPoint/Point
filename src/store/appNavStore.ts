import { create } from 'zustand';

export type PresentationMode = 'with-materials' | null;

interface AppNavState {
  landingDone: boolean;
  showDashboard: boolean;
  showPricing: boolean;
  presentationMode: PresentationMode;
  setLandingDone: (v: boolean) => void;
  setShowDashboard: (v: boolean) => void;
  setShowPricing: (v: boolean) => void;
  setPresentationMode: (m: PresentationMode) => void;
  resetAppNav: () => void;
}

export const useAppNavStore = create<AppNavState>((set) => ({
  landingDone: false,
  showDashboard: false,
  showPricing: false,
  presentationMode: null,
  setLandingDone: (v) => set({ landingDone: v }),
  setShowDashboard: (v) => set({ showDashboard: v }),
  setShowPricing: (v) => set({ showPricing: v }),
  setPresentationMode: (m) => set({ presentationMode: m }),
  resetAppNav: () =>
    set({
      landingDone: false,
      showDashboard: false,
      showPricing: false,
      presentationMode: null,
    }),
}));
