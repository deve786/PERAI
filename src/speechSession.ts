import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { Platform } from 'react-native';

/**
 * The phone's own English, not American English.
 *
 * Recognition of names, places and titles is markedly better under the local
 * variety — "en-IN" hears Indian names the way they are actually said. Read
 * from Intl rather than a native locale package, so this stays shippable as an
 * over-the-air update. Anything that is not English falls back to en-US, since
 * the extraction prompt and the app's own wording are English.
 */
function deviceEnglish(): string {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    return /^en([-_]|$)/i.test(locale) ? locale.replace('_', '-') : 'en-US';
  } catch {
    return 'en-US';
  }
}

/** Settings key holding a manual language override, e.g. "en-IN". */
export const SPEECH_LANGUAGE_KEY = 'speech.language';

let language = deviceEnglish();

/** Override the recognizer's language, e.g. from a saved preference. */
export function setSpeechLanguage(next: string | null): void {
  language = next?.trim() || deviceEnglish();
}

export function speechLanguage(): string {
  return language;
}

// Continuous recognition keeps one session going across pauses, so nothing is
// torn down and restarted mid-note. Android only has it from 13 (API 33).
let continuousAvailable = Platform.OS !== 'android' || Number(Platform.Version) >= 33;

export function usingContinuous(): boolean {
  return continuousAvailable;
}

/**
 * Some Android 13+ phones' recognizers reject continuous (segmented) sessions.
 * After one failure, every later session in this run uses restart-on-pause.
 */
export function disableContinuous(): void {
  continuousAvailable = false;
}

export function startSpeech(options: { contextualStrings?: string[]; volume?: boolean } = {}): void {
  ExpoSpeechRecognitionModule.start({
    lang: language,
    interimResults: true,
    continuous: continuousAvailable,
    ...(options.contextualStrings?.length ? { contextualStrings: options.contextualStrings } : {}),
    ...(options.volume ? { volumeChangeEventOptions: { enabled: true, intervalMillis: 100 } } : {}),
  });
}
