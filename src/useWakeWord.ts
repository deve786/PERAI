import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionErrorCode,
} from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_WAKE_PHRASES, matchesTrailingPhrase } from './voiceStop';

export type WakeWordStage = 'off' | 'listening';

export { DEFAULT_WAKE_PHRASES };

function describeError(code: ExpoSpeechRecognitionErrorCode): string {
  if (code === 'not-allowed' || code === 'service-not-allowed') {
    return 'Microphone or speech recognition access is off. Turn it on in Settings.';
  }
  return "Couldn't listen for the wake phrase. Try turning it off and on.";
}

/**
 * Listens hands-free for a spoken phrase and calls `onWake()` the moment it's
 * heard, then stops itself — the caller restarts it (via `armed`) once ready
 * to listen again. Reuses the same on-device recognizer and restart-on-pause
 * loop as useVoiceInput.ts, so there is no separate wake-word engine, account
 * or training step: the phrase is just matched as recognized text, so typing
 * a new one in Settings works immediately.
 *
 * Only one expo-speech-recognition session can run at a time. The caller is
 * responsible for setting `armed` to false while useVoiceInput's own session
 * is capturing a note (see app/(tabs)/index.tsx) — this hook stops itself as
 * soon as `armed` goes false, freeing the mic.
 */
export function useWakeWord(armed: boolean, phrases: readonly string[], onWake: () => void) {
  const [stage, setStage] = useState<WakeWordStage>('off');
  const [error, setError] = useState<string | null>(null);

  const stageRef = useRef<WakeWordStage>('off');
  const stopRequested = useRef(true);
  const onWakeRef = useRef(onWake);
  onWakeRef.current = onWake;
  const phrasesRef = useRef(phrases);
  phrasesRef.current = phrases;

  const setStageBoth = (next: WakeWordStage) => {
    stageRef.current = next;
    setStage(next);
  };

  const restart = useCallback(() => {
    if (stopRequested.current) return;
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: false,
    });
  }, []);

  const stop = useCallback(() => {
    stopRequested.current = true;
    if (stageRef.current === 'listening') ExpoSpeechRecognitionModule.stop();
    setStageBoth('off');
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      setError('Microphone or speech recognition access is off. Turn it on in Settings.');
      return;
    }
    stopRequested.current = false;
    setStageBoth('listening');
    restart();
  }, [restart]);

  useEffect(() => {
    if (armed) void start();
    else stop();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed]);

  useSpeechRecognitionEvent('result', (event) => {
    if (stageRef.current !== 'listening') return;
    const transcript = event.results[0]?.transcript ?? '';

    if (matchesTrailingPhrase(transcript, phrasesRef.current)) {
      stop();
      onWakeRef.current();
      return;
    }

    if (event.isFinal && !stopRequested.current) restart();
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (stageRef.current !== 'listening' || stopRequested.current) return;
    if (event.error === 'no-speech' || event.error === 'speech-timeout') {
      // Android's non-continuous session timed out hearing nothing — normal
      // while waiting for a wake phrase; just listen again.
      restart();
      return;
    }
    stopRequested.current = true;
    setStageBoth('off');
    setError(describeError(event.error));
  });

  return { stage, error };
}
