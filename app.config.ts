import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Dynamic config layered on top of app.json.
 *
 * The Gemini key is read from the environment at bundle time and exposed
 * through `Constants.expoConfig.extra`. See README "API key handling" — this is
 * an MVP-only shortcut; the key ends up in the JS bundle.
 *
 * The Supabase values belong in the bundle: the URL is public and the anon key
 * is meant to be, since row-level security is what keeps one account's rows
 * from another's.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  extra: {
    ...config.extra,
    geminiApiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '',
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    expenseSupabaseUrl: process.env.EXPO_PUBLIC_EXPENSE_SUPABASE_URL ?? '',
    expenseSupabaseAnonKey: process.env.EXPO_PUBLIC_EXPENSE_SUPABASE_ANON_KEY ?? '',
  },
});
