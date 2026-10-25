import { getSetting, setSetting } from './db/queries';
import { setSpeechLanguage, SPEECH_LANGUAGE_KEY } from './speechSession';

/**
 * The two choices that decide how the app handles a language other than
 * English: what the recognizer listens for, and what the record is written in.
 *
 * Both live in the `settings` table alongside the theme, and both have a
 * default that keeps today's behaviour exactly as it is.
 */

/**
 * What the speech recognizer is asked to listen for.
 *
 * What each returns, which is why the choice matters:
 * - `en-IN` — Latin letters. Malayalam spoken into it comes back as Manglish
 *   ("innale petrol adichu"), which the glossary in src/manglish.ts reads.
 * - `ml-IN` — Malayalam script ("ഇന്നലെ പെട്രോൾ അടിച്ചു"). English words
 *   spoken into it are usually transliterated into script too, so a mixed
 *   sentence loses its English spelling.
 * - `mixed` — asks for `ml-IN`, which handles Malayalam best, and leaves the
 *   English words it returns to the extraction prompt, which reads both.
 */
export type VoiceLanguage = 'en-IN' | 'ml-IN' | 'mixed';

/** What titles and tags are written in. The raw note is never translated. */
export type TitleLanguage = 'english' | 'original';

export type AiModelChoice =
  | 'openai/gpt-oss-120b'
  | 'qwen/qwen3.8-27b'
  | 'openai/gpt-oss-20b'
  | 'gemini-3.5-flash-lite'
  | 'gemini-3.8-flash'
  | 'llama-3.3-70b-versatile';

export const AI_MODELS: {
  value: AiModelChoice;
  label: string;
  desc: string;
  speed: string;
  provider: 'gemini' | 'groq';
  icon: string;
}[] = [
  {
    value: 'openai/gpt-oss-120b',
    label: 'GPT OSS 120B (Groq)',
    desc: 'Flagship 120B open model. Top RAG reasoning and accurate synthesis.',
    speed: '~1s',
    provider: 'groq',
    icon: 'rocket-outline',
  },
  {
    value: 'qwen/qwen3.8-27b',
    label: 'Qwen 3.8 27B (Groq)',
    desc: 'Superior multilingual model. Great for Malayalam, Manglish & tables.',
    speed: '~0.8s',
    provider: 'groq',
    icon: 'flash-outline',
  },
  {
    value: 'openai/gpt-oss-20b',
    label: 'GPT OSS 20B (Groq)',
    desc: 'Ultra-fast inference (<0.6s). Instant answers to everyday queries.',
    speed: '<0.6s',
    provider: 'groq',
    icon: 'flash-outline',
  },
  {
    value: 'gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash Lite',
    desc: 'Fast (2–4s), generous free quota. Default Gemini ask model.',
    speed: '~2–4s',
    provider: 'gemini',
    icon: 'flash-outline',
  },
  {
    value: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    desc: 'Deep reasoning model. Slower on mobile (~30–45s).',
    speed: '~35–45s',
    provider: 'gemini',
    icon: 'hardware-chip-outline',
  },
];

const TITLE_LANGUAGE_KEY = 'titles.language';
const AI_MODEL_KEY = 'ai.ask_model';

export const VOICE_LANGUAGES: { value: VoiceLanguage; label: string; hint: string }[] = [
  { value: 'en-IN', label: 'English (India)', hint: 'Malayalam comes back written in English letters' },
  { value: 'ml-IN', label: 'Malayalam', hint: 'Returns Malayalam script' },
  { value: 'mixed', label: 'Mixed', hint: 'Tries Malayalam first, keeps English words' },
];

export const TITLE_LANGUAGES: { value: TitleLanguage; label: string; hint: string }[] = [
  { value: 'english', label: 'English', hint: 'Your own words are still kept on every entry' },
  { value: 'original', label: 'As spoken', hint: 'Titles stay in the language you used' },
];

/** The locale handed to the recognizer for a choice. */
export function localeFor(language: VoiceLanguage): string {
  return language === 'mixed' ? 'ml-IN' : language;
}

export async function getVoiceLanguage(): Promise<VoiceLanguage | null> {
  const stored = await getSetting(SPEECH_LANGUAGE_KEY);
  if (stored === 'en-IN' || stored === 'ml-IN' || stored === 'mixed') return stored;
  // Nothing chosen: the recognizer follows the phone, as it did before.
  return null;
}

export async function setVoiceLanguage(language: VoiceLanguage | null): Promise<void> {
  await setSetting(SPEECH_LANGUAGE_KEY, language ?? '');
  setSpeechLanguage(language === null ? null : localeFor(language));
}

export async function getTitleLanguage(): Promise<TitleLanguage> {
  return (await getSetting(TITLE_LANGUAGE_KEY)) === 'original' ? 'original' : 'english';
}

export async function setTitleLanguage(language: TitleLanguage): Promise<void> {
  await setSetting(TITLE_LANGUAGE_KEY, language);
}

const GROQ_API_KEY = 'ai.groq_api_key';

export async function getGroqApiKey(): Promise<string> {
  const stored = await getSetting(GROQ_API_KEY);
  if (stored && stored.trim().length > 0) return stored.trim();
  return process.env.EXPO_PUBLIC_GROQ_API_KEY || '';
}

export async function setGroqApiKey(key: string): Promise<void> {
  await setSetting(GROQ_API_KEY, key.trim());
}

export async function getSelectedAiModel(): Promise<AiModelChoice> {
  const stored = await getSetting(AI_MODEL_KEY);
  if (
    stored === 'openai/gpt-oss-120b' ||
    stored === 'qwen/qwen3.8-27b' ||
    stored === 'openai/gpt-oss-20b' ||
    stored === 'gemini-3.5-flash-lite' ||
    stored === 'gemini-3.8-flash' ||
    stored === 'llama-3.3-70b-versatile'
  ) {
    return stored;
  }
  return (process.env.EXPO_PUBLIC_GEMINI_ASK_MODEL as AiModelChoice) || 'gemini-3.5-flash-lite';
}

export async function setSelectedAiModel(model: AiModelChoice): Promise<void> {
  await setSetting(AI_MODEL_KEY, model);
}

export const TELEGRAM_AUTO_SYNC_INTERVAL_KEY = 'sources.telegram_auto_sync_interval';

/**
 * Auto sync interval in minutes for Telegram channels.
 * 0 = Off
 * Default = 5 (every 5 minutes)
 */
export async function getTelegramAutoSyncInterval(): Promise<number> {
  const val = await getSetting(TELEGRAM_AUTO_SYNC_INTERVAL_KEY);
  if (val !== null && val !== undefined) {
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 0) return parsed;
  }
  return 5; // Default: 5 minutes
}

export async function setTelegramAutoSyncInterval(minutes: number): Promise<void> {
  await setSetting(TELEGRAM_AUTO_SYNC_INTERVAL_KEY, String(minutes));
}

/** Read at startup, so a saved choice survives a restart. */
export async function applySavedVoiceLanguage(): Promise<void> {
  const language = await getVoiceLanguage();
  setSpeechLanguage(language === null ? null : localeFor(language));
}
