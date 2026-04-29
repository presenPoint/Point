import { create } from 'zustand';

type ToastState = {
  message: string | null;
  showToast: (message: string, durationMs?: number) => void;
  clearToast: () => void;
};

let hideTimer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  showToast: (message, durationMs = 2800) => {
    if (hideTimer) clearTimeout(hideTimer);
    set({ message });
    hideTimer = setTimeout(() => {
      set({ message: null });
      hideTimer = null;
    }, durationMs);
  },
  clearToast: () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    set({ message: null });
  },
}));
