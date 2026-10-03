import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionErrorCode,
} from 'expo-speech-recognition';
import { useEffect, useRef, useState } from 'react';
import { disableContinuous, startSpeech, usingContinuous } from './speechSession';
import { isFreshPartial, joinSpelledLetters, restatesEarlier } from './speechText';
import { isStopCommand, shouldFinish } from './voiceStop';

/** `finishing`: stopped, waiting briefly for the recognizer's final wording. */
export type VoiceStage = 'idle' | 'listening' | 'finishing';

const CHECK_MS = 250;
const FINAL_RESULT_WAIT_MS = 800;

/** Human-readable text for the codes the library defines, once each. */
function describeSpeechError(code: ExpoSpeechRecognitionErrorCode): string {
  switch (code) {
    case 'not-allowed':
      return 'Microphone or speech recognition access is off. Turn it on in Settings.';
    case 'service-not-allowed':
      return "This phone's speech recognizer is unavailable right now.";
    case 'audio-capture':
      return 'Could not read from the microphone.';
    case 'network':
      return 'Speech recognition needs a network connection here. Check your connection.';
    case 'busy':
      return 'Still finishing the last recording — try again in a moment.';
    case 'language-not-supported':
      return "This phone's speech recognizer doesn't support English here.";
    default:
      return 'Voice input had a problem. Try again.';
  }
}

/**
 * Press to talk, with live captions.
 *
 * Recording ends by itself once you stop speaking, the moment you say a stop
 * phrase, or when the mic is pressed again. Uses the phone's own speech
 * recognizer, so the transcript is already the text to use.
 *
 * Three things keep a long note whole:
 * - The session is only restarted after the old one has sent `end`. The
 *   library tears a finished session down asynchronously; starting a new one
 *   before that lands let the teardown destroy the new session instead.
 * - A live transcript the recognizer abandons mid-note (see isFreshPartial) is
 *   kept as a finished segment instead of being overwritten.
 * - Stopping waits briefly for the final result, which is more accurate than
 *   the last live caption and covers the whole of the last segment.
 *
 * @param options.contextualStrings words to bias recognition towards — names
 *        already in the record, so they're heard as spelled there.
 */
export function useVoiceInput(
  onTranscript: (text: string) => void,
  options: { contextualStrings?: string[] } = {}
) {
  const [stage, setStage] = useState<VoiceStage>('idle');
  const [liveText, setLiveText] = useState('');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const stageRef = useRef<VoiceStage>('idle');
  const busy = useRef(false);
  const callback = useRef(onTranscript);
  callback.current = onTranscript;
  const hints = useRef(options.contextualStrings);
  hints.current = options.contextualStrings;

  // Finished segments, plus the one still being spoken.
  const segments = useRef<string[]>([]);
  const currentSegment = useRef('');
  // Segments committed because the live transcript restarted, since the last
  // final result — dropped again if that final result repeats them.
  const provisional = useRef(0);
  const startedAt = useRef(0);
  const lastEventAt = useRef(0);
  const heardAnything = useRef(false);
  // Whether an `end` event now belongs to our own current session, rather than
  // to one that was already being torn down when we started.
  const sessionLive = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const finalWait = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setStageBoth = (next: VoiceStage) => {
    stageRef.current = next;
    setStage(next);
  };

  const stopTimers = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (finalWait.current) clearTimeout(finalWait.current);
    finalWait.current = null;
    setLevel(0);
  };

  const fullText = () =>
    joinSpelledLetters(
      [...segments.current, currentSegment.current].join(' ').replace(/\s+/g, ' ').trim()
    );

  const reset = () => {
    segments.current = [];
    currentSegment.current = '';
    provisional.current = 0;
    setLiveText('');
  };

  const begin = () => {
    sessionLive.current = false;
    startSpeech({ contextualStrings: hints.current, volume: true });
  };

  const deliver = () => {
    if (stageRef.current !== 'finishing') return;
    stopTimers();
    const text = fullText();
    reset();
    setStageBoth('idle');
    if (text) callback.current(text);
    else setError('Nothing was recorded.');
  };

  /**
   * @param use          false throws the recording away
   * @param waitForFinal false when the words are already known to be complete
   */
  const finish = (use: boolean, waitForFinal = true) => {
    if (stageRef.current !== 'listening') return;
    stopTimers();
    if (!use) {
      setStageBoth('idle');
      reset();
      ExpoSpeechRecognitionModule.abort();
      return;
    }
    setStageBoth('finishing');
    if (!waitForFinal) {
      ExpoSpeechRecognitionModule.abort();
      deliver();
      return;
    }
    ExpoSpeechRecognitionModule.stop();
    finalWait.current = setTimeout(deliver, FINAL_RESULT_WAIT_MS);
  };

  const check = () => {
    if (stageRef.current !== 'listening') return;
    const now = Date.now();
    if (shouldFinish(heardAnything.current, now - startedAt.current, now - lastEventAt.current)) {
      finish(true);
    }
  };
  const checkRef = useRef(check);
  checkRef.current = check;

  const start = async () => {
    setError(null);
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      setError('Microphone or speech recognition access is off. Turn it on in Settings.');
      return;
    }

    reset();
    heardAnything.current = false;
    startedAt.current = Date.now();
    lastEventAt.current = Date.now();
    setStageBoth('listening');
    begin();
    timer.current = setInterval(() => checkRef.current(), CHECK_MS);
  };

  useSpeechRecognitionEvent('start', () => {
    if (stageRef.current !== 'idle') sessionLive.current = true;
  });

  useSpeechRecognitionEvent('volumechange', (event) => {
    if (stageRef.current !== 'listening') return;
    // event.value ranges roughly -2..10; below 0 is documented as inaudible.
    setLevel(Math.max(0, Math.min(1, event.value / 10)));
  });

  useSpeechRecognitionEvent('result', (event) => {
    const current = stageRef.current;
    if (current === 'idle') return;

    const transcript = (event.results[0]?.transcript ?? '').trim();
    if (!transcript) return;
    lastEventAt.current = Date.now();
    heardAnything.current = true;

    if (!event.isFinal && isFreshPartial(currentSegment.current, transcript)) {
      segments.current.push(currentSegment.current);
      provisional.current += 1;
    }
    currentSegment.current = transcript;

    if (current === 'listening' && isStopCommand(transcript)) {
      currentSegment.current = '';
      setLiveText(fullText());
      finish(true, false);
      return;
    }

    if (event.isFinal) {
      if (provisional.current > 0) {
        const earlier = segments.current.slice(-provisional.current).join(' ');
        if (restatesEarlier(transcript, earlier)) segments.current.splice(-provisional.current);
      }
      provisional.current = 0;
      segments.current.push(transcript);
      currentSegment.current = '';
    }

    setLiveText(fullText());
    if (event.isFinal && current === 'finishing') deliver();
  });

  useSpeechRecognitionEvent('end', () => {
    const current = stageRef.current;
    if (current === 'finishing') {
      deliver();
      return;
    }
    if (current !== 'listening' || !sessionLive.current) return;

    // The session ended by itself (a pause without continuous recognition, or
    // the recognizer's own time limit) while we're still recording: keep any
    // unfinalised words and listen again.
    if (currentSegment.current) {
      segments.current.push(currentSegment.current);
      currentSegment.current = '';
    }
    provisional.current = 0;
    begin();
  });

  useSpeechRecognitionEvent('error', (event) => {
    const current = stageRef.current;
    if (current !== 'listening') return; // while finishing, `end` delivers
    sessionLive.current = true;

    // Routine: silence, or our own restart. `end` follows and restarts.
    if (event.error === 'aborted' || event.error === 'no-speech' || event.error === 'speech-timeout') {
      return;
    }
    if (usingContinuous() && !heardAnything.current && event.error !== 'not-allowed') {
      disableContinuous();
      return;
    }

    stopTimers();
    setStageBoth('idle');
    reset();
    setError(describeSpeechError(event.error));
  });

  /** Press the mic: start, or end and use what was said so far. */
  const toggle = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (stageRef.current === 'listening') finish(true);
      else if (stageRef.current === 'idle') await start();
    } finally {
      busy.current = false;
    }
  };

  /** Throw the recording away. */
  const cancel = () => finish(false);

  // Never leave the recognizer running if the screen goes away mid-session.
  useEffect(
    () => () => {
      if (stageRef.current !== 'idle') {
        stageRef.current = 'idle';
        if (timer.current) clearInterval(timer.current);
        if (finalWait.current) clearTimeout(finalWait.current);
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
