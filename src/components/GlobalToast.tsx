import { useToastStore } from '../store/toastStore';

export function GlobalToast() {
  const message = useToastStore((s) => s.message);
  if (!message) return null;
  return (
    <div className="global-toast" role="status" aria-live="polite">
      <span className="global-toast-icon" aria-hidden>
        ✓
      </span>
      <span className="global-toast-text">{message}</span>
    </div>
  );
}
