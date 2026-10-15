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

const TITLE_LANGUAGE_KEY = 'titles.language';

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

/** Read at startup, so a saved choice survives a restart. */
export async function applySavedVoiceLanguage(): Promise<void> {
  const language = await getVoiceLanguage();
  setSpeechLanguage(language === null ? null : localeFor(language));
}
