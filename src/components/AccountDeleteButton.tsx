import { useState } from 'react';
import { requestAccountDeletion } from '../lib/account';
import { supabase } from '../lib/supabase';
import { useT } from '../hooks/useT';
import { DeleteAccountModal } from './DeleteAccountModal';

type Props = {
  className?: string;
  onDeleted: () => void;
};

export function AccountDeleteButton({ className, onDeleted }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={className ?? 'account-delete-link'}
        onClick={() => setOpen(true)}
      >
        {t('account.delete.link')}
      </button>
      <DeleteAccountModal
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={async () => {
          const res = await requestAccountDeletion();
          if (res.ok && supabase) await supabase.auth.signOut();
          return res;
        }}
        onSuccess={() => {
          setOpen(false);
          onDeleted();
        }}
      />
    </>
  );
}
