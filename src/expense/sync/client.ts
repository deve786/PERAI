/**
 * Expenses back up to the same Supabase project as memories, so there is one
 * account and one session. This file only re-exports the shared client; the
 * sync code in this folder keeps importing from here.
 */
export { getSupabase, isConfigured, currentUserId, currentEmail } from '../../sync/client';
