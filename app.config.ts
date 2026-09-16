import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Dynamic config layered on top of app.json.
 *
 * The Gemini key is read from the environment at bundle time and exposed
 * through `Constants.expoConfig.extra`. See README "API key handling" — this is
 * an MVP-only shortcut; the key ends up in the JS bundle.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  extra: {
    ...config.extra,
    geminiApiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '',
  },
});
