import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { getSetting, setSetting } from '../db/queries';

function fromConfig(key: string): string {
  const extra = Constants?.expoConfig?.extra as Record<string, string> | undefined;
  return extra?.[key] ?? '';
}

export function supabaseUrl(): string {
  return fromConfig('supabaseUrl') || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
}

export function supabaseKey(): string {
  return fromConfig('supabaseAnonKey') || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
}

/** With no project set up, the app stays exactly as it was: local only. */
export function isConfigured(): boolean {
  return supabaseUrl().length > 0 && supabaseKey().length > 0;
}

/**
 * Where the signed-in session is kept.
 *
 * The app already has a key/value table, so the session rides along in the
 * app's own private database instead of pulling in AsyncStorage. Every call is
 * guarded: a failure to remember a session must never break the app, it only
 * means signing in again.
 */
const sessionStore = {
  async getItem(key: string): Promise<string | null> {
    try {
      return await getSetting(`auth.${key}`);
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      await setSetting(`auth.${key}`, value);
    } catch {
      // Signed in for this run only.
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      await setSetting(`auth.${key}`, '');
    } catch {
      // Nothing to clean up.
    }
  },
};

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isConfigured()) throw new Error('No Supabase project configured.');
  if (!cached) {
    cached = createClient(supabaseUrl(), supabaseKey(), {
      auth: {
        storage: sessionStore,
        autoRefreshToken: true,
        persistSession: true,
        // No browser here, so there is no URL carrying a session to detect.
        detectSessionInUrl: false,
      },
    });
  }
  return cached;
}

export async function currentUserId(): Promise<string | null> {
  if (!isConfigured()) return null;
  const { data } = await getSupabase().auth.getSession();
  return data.session?.user.id ?? null;
}

export async function currentEmail(): Promise<string | null> {
  if (!isConfigured()) return null;
  const { data } = await getSupabase().auth.getSession();
  return data.session?.user.email ?? null;
}
