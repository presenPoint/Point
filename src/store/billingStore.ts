import { create } from 'zustand';
import { fetchSubscription } from '../lib/billing';
import type { Subscription } from '../types/billing';

interface BillingState {
  subscription: Subscription | null;
  loading: boolean;
  loaded: boolean;
  refresh: () => Promise<void>;
  reset: () => void;
}

export const useBillingStore = create<BillingState>((set) => ({
  subscription: null,
  loading: false,
  loaded: false,

  refresh: async () => {
    set({ loading: true });
    const sub = await fetchSubscription();
    set({ subscription: sub, loading: false, loaded: true });
  },

  reset: () => set({ subscription: null, loading: false, loaded: false }),
}));
