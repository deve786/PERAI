import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionErrorCode,
} from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isStopCommand, shouldFinish, stripStopCommand } from './voiceStop';

export type VoiceStage = 'idle' | 'listening';

const CHECK_MS = 250;

/** Human-readable text for the codes the library defines, once each. */
function describeSpeechError(code: ExpoSpeechRecognitionErrorCode): string {
  switch (code) {
    case 'not-allowed':
      return 'Microphone or speech recognition access is off. Turn it on in Settings.';
    case 'service-not-allowed':
      return "This phone's speech recognizer is unavailable right now.";
    case 'no-speech':
    case 'speech-timeout':
      return "Didn't hear anything. Press the mic and speak.";
    case 'audio-capture':
      return 'Could not read from the microphone.';
    case 'network':
      return 'Speech recognition needs a network connection here. Check your connection.';
    case 'busy':
      return 'Still finishing the last recording — try again in a moment.';
    case 'language-not-supported':
      return "This phone's speech recognizer doesn't support English here.";
    case 'aborted':
      return ''; // We asked for this (cancel/restart) — never shown as an error.
    default:
      return 'Voice input had a problem. Try again.';
  }
}

/**
 * Press to talk, with live captions.
 *
 * Recording ends by itself once you stop speaking, or the moment you say a
 * stop phrase ("stop listening"), or press the mic again to end it
 * immediately. Uses the phone's own on-device speech recognizer
 * (`expo-speech-recognition`) — free, and the transcript is already the text
 * to use, so there is no separate transcription call afterward.
 *
 * Android's non-continuous recognition session ends after one completed
 * utterance even mid-note, so this restarts it under the hood on every pause
 * and stitches the segments back together; `liveText` always holds the full
 * note so far, restart included.
 */
export function useVoiceInput(onTranscript: (text: string) => void) {
  const [stage, setStage] = useState<VoiceStage>('idle');
  const [liveText, setLiveText] = useState('');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const stageRef = useRef<VoiceStage>('idle');
  const busy = useRef(false);
  const callback = useRef(onTranscript);
  callback.current = onTranscript;

  // Segments completed so far (each ended in a natural pause), plus whatever
  // the current, still-in-progress segment is showing.
  const segments = useRef<string[]>([]);
  const currentSegment = useRef('');
  const startedAt = useRef(0);
  const lastEventAt = useRef(0);
  const stopRequested = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const setStageBoth = (next: VoiceStage) => {
    stageRef.current = next;
    setStage(next);
  };

  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setLevel(0);
  };

  const fullText = useCallback(
    () => [...segments.current, currentSegment.current].join(' ').replace(/\s+/g, ' ').trim(),
    []
  );

  /** End the session. `use: false` discards whatever was said. */
  const finish = useCallback(
    (use: boolean) => {
      if (stageRef.current !== 'listening') return;
      stopRequested.current = true;
      stopTimer();
      setStageBoth('idle');
      ExpoSpeechRecognitionModule.stop();

      if (!use) {
        setLiveText('');
        segments.current = [];
        currentSegment.current = '';
        return;
      }

      const text = stripStopCommand(fullText(), currentSegment.current);
      setLiveText('');
      segments.current = [];
      currentSegment.current = '';
      if (text) callback.current(text);
      else setError('Nothing was recorded.');
    },
    [fullText]
  );

  const check = useCallback(() => {
    if (stageRef.current !== 'listening') return;
    const now = Date.now();
    const hadSpeech = fullText().length > 0;
    if (shouldFinish(hadSpeech, now - startedAt.current, now - lastEventAt.current)) {
      finish(true);
    }
  }, [fullText, finish]);

  const start = useCallback(async () => {
    setError(null);

    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      setError('Microphone or speech recognition access is off. Turn it on in Settings.');
      return;
    }

    segments.current = [];
    currentSegment.current = '';
    setLiveText('');
    stopRequested.current = false;
    startedAt.current = Date.now();
    lastEventAt.current = Date.now();
    setStageBoth('listening');

    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: false, // we drive our own restart-on-pause loop below
      volumeChangeEventOptions: { enabled: true, intervalMillis: 100 },
      androidIntentOptions: {
        // Best-effort hint to the recognizer; our own `check()` loop above
        // is what actually enforces the pause-to-finish timing.
        EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 5000,
      },
    });

    timer.current = setInterval(check, CHECK_MS);
  }, [check]);

  useSpeechRecognitionEvent('volumechange', (event) => {
    // event.value ranges roughly -2..10; below 0 is documented as inaudible.
    setLevel(Math.max(0, Math.min(1, event.value / 10)));
  });

  useSpeechRecognitionEvent('result', (event) => {
    if (stageRef.current !== 'listening') return;
    lastEventAt.current = Date.now();

    const transcript = event.results[0]?.transcript ?? '';
    currentSegment.current = transcript;
    setLiveText(fullText());

    if (isStopCommand(transcript)) {
      finish(true);
      return;
    }

    if (event.isFinal) {
      // This utterance is done, but we're not — fold it in and keep
      // listening across the pause rather than ending the recording.
      if (transcript.trim()) segments.current.push(transcript.trim());
      currentSegment.current = '';
      if (!stopRequested.current && stageRef.current === 'listening') {
        ExpoSpeechRecognitionModule.start({
          lang: 'en-US',
          interimResults: true,
          continuous: false,
          volumeChangeEventOptions: { enabled: true, intervalMillis: 100 },
          androidIntentOptions: { EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 5000 },
        });
      }
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (stageRef.current !== 'listening' || stopRequested.current) return;
    const message = describeSpeechError(event.error);
    // A no-speech/timeout mid-restart is routine, not a failure — the check()
    // loop already decides whether that means "done" or "give up"; let it.
    if (event.error === 'no-speech' || event.error === 'speech-timeout') return;
    if (message) {
      stopTimer();
      setStageBoth('idle');
      setError(message);
    }
  });

  /** Press the mic: start, or end early and use whatever was said so far. */
  const toggle = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (stageRef.current === 'listening') {
        finish(true);
      } else {
        await start();
      }
    } finally {
      busy.current = false;
    }
  }, [finish, start]);

  /** Throw the recording away. */
  const cancel = useCallback(() => {
    finish(false);
  }, [finish]);

  // Never leave the recognizer running if the screen goes away mid-session.
  useEffect(
    () => () => {
      if (stageRef.current === 'listening') {
        stopRequested.current = true;
        stopTimer();
        ExpoSpeechRecognitionModule.abort();
      }
    },
    []
  );

  return {
    stage,
    liveText,
    level,
    error,
    toggle,
    cancel,
    clearError: () => setError(null),
  };
}
