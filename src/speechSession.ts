import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { Platform } from 'react-native';

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
    lang: 'en-US',
    interimResults: true,
    continuous: continuousAvailable,
    ...(options.contextualStrings?.length ? { contextualStrings: options.contextualStrings } : {}),
    ...(options.volume ? { volumeChangeEventOptions: { enabled: true, intervalMillis: 100 } } : {}),
  });
}
