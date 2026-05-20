import { useState } from 'react';
import type { DeleteAccountResult } from '../lib/account';
import { useT } from '../hooks/useT';

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<DeleteAccountResult>;
  onSuccess: () => void;
};

export function DeleteAccountModal({ open, onClose, onConfirm, onSuccess }: Props) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  if (!open) return null;

  const handleDelete = async () => {
    if (!checked || busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await onConfirm();
      if (res.ok) {
        onSuccess();
        return;
      }
      const code = res.code;
      if (code === 'invoke_failed' || code === 'network') {
        setError(t('account.delete.errorUnavailable'));
      } else if (code === 'invalid_token' || code === 'missing_auth') {
        setError(t('account.delete.errorAuth'));
      } else {
        setError(res.error || t('account.delete.errorGeneric'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="account-delete-overlay" role="dialog" aria-modal="true" aria-labelledby="account-delete-title">
      <div className="account-delete-card">
        <h2 id="account-delete-title" className="account-delete-title">
          {t('account.delete.title')}
        </h2>
        <p className="account-delete-lead">{t('account.delete.lead')}</p>
        <ul className="account-delete-list">
          <li>{t('account.delete.itemSessions')}</li>
          <li>{t('account.delete.itemReports')}</li>
          <li>{t('account.delete.itemBilling')}</li>
        </ul>
        <label className="account-delete-check">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            disabled={busy}
          />
          <span>{t('account.delete.confirmCheck')}</span>
        </label>
        {error && <p className="account-delete-error">{error}</p>}
        <div className="account-delete-actions">
          <button type="button" className="btn-transcript" onClick={onClose} disabled={busy}>
            {t('account.delete.cancel')}
          </button>
          <button
            type="button"
            className="btn-account-delete"
            onClick={() => void handleDelete()}
            disabled={!checked || busy}
          >
            {busy ? t('account.delete.deleting') : t('account.delete.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
