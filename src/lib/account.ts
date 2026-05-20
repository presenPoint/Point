import { supabase } from './supabase';

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

export async function requestAccountDeletion(): Promise<DeleteAccountResult> {
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured.', code: 'no_supabase' };
  }

  try {
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string; detail?: string }>(
      'delete-account',
      { body: {} },
    );

    if (error) {
      return {
        ok: false,
        error:
          'Could not reach the account deletion service. Deploy supabase/functions/delete-account or try again later.',
        code: 'invoke_failed',
      };
    }

    if (!data?.ok) {
      const code = data?.error ?? 'unknown';
      return {
        ok: false,
        error: data?.detail ?? data?.error ?? 'Account deletion failed.',
        code,
      };
    }

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Network error',
      code: 'network',
    };
  }
}
