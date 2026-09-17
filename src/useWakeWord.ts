import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionErrorCode,
} from 'expo-speech-recognition';
import { useEffect, useRef, useState } from 'react';
import { disableContinuous, startSpeech, usingContinuous } from './speechSession';
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
 * to listen again. Same recognizer and session handling as useVoiceInput.ts:
 * the phrase is matched as recognized text, and a session is only restarted
 * after the previous one has sent `end`.
 *
 * Only one recognition session can run at a time. The caller sets `armed` to
 * false while a note is being captured (see app/(tabs)/index.tsx). Stopping
 * aborts rather than stops, so the wake phrase's own final result is never
 * delivered — it would otherwise land inside the note that starts next.
 */
export function useWakeWord(armed: boolean, phrases: readonly string[], onWake: () => void) {
  const [stage, setStage] = useState<WakeWordStage>('off');
  const [error, setError] = useState<string | null>(null);

  const stageRef = useRef<WakeWordStage>('off');
  const heardAnything = useRef(false);
  const sessionLive = useRef(false);
  const onWakeRef = useRef(onWake);
  onWakeRef.current = onWake;
  const phrasesRef = useRef(phrases);
  phrasesRef.current = phrases;

  const setStageBoth = (next: WakeWordStage) => {
    stageRef.current = next;
    setStage(next);
  };

  const begin = () => {
    sessionLive.current = false;
    startSpeech();
  };

  const stop = () => {
    if (stageRef.current === 'listening') ExpoSpeechRecognitionModule.abort();
    setStageBoth('off');
  };

  const start = async () => {
    setError(null);
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      setError('Microphone or speech recognition access is off. Turn it on in Settings.');
      return;
    }
    heardAnything.current = false;
    setStageBoth('listening');
    begin();
  };

  const armedRef = useRef(armed);
  armedRef.current = armed;
  useEffect(() => {
    if (armed) {
      void start().then(() => {
        // Disarmed while the permission prompt was open.
        if (!armedRef.current) stop();
      });
    } else {
      stop();
    }
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed]);

  useSpeechRecognitionEvent('start', () => {
    if (stageRef.current === 'listening') sessionLive.current = true;
  });

  useSpeechRecognitionEvent('result', (event) => {
    if (stageRef.current !== 'listening') return;
    heardAnything.current = true;
    const transcript = event.results[0]?.transcript ?? '';
    if (matchesTrailingPhrase(transcript, phrasesRef.current)) {
      stop();
      onWakeRef.current();
    }
  });

  useSpeechRecognitionEvent('end', () => {
    // A pause or the recognizer's own limit ended the session: listen again.
    if (stageRef.current === 'listening' && sessionLive.current) begin();
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (stageRef.current !== 'listening') return;
    sessionLive.current = true;
    if (event.error === 'no-speech' || event.error === 'speech-timeout' || event.error === 'aborted') {
      return; // `end` follows and restarts
    }
    if (usingContinuous() && !heardAnything.current && event.error !== 'not-allowed') {
      disableContinuous();
      return;
    }
    setStageBoth('off');
    setError(describeError(event.error));
  });

  return { stage, error };
}
