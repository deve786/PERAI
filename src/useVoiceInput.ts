import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from './ai/client';
import { transcribeRecording } from './ai/transcribe';

export type VoiceStage = 'idle' | 'listening' | 'transcribing';

// Module-level so the recorder hook receives a stable options object.
const OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

const SAMPLE_MS = 100;
/** Quiet this long after speaking = finished. */
const END_OF_SPEECH_MS = 1600;
/** Nothing said this long after pressing = give up without a model call. */
const NO_SPEECH_TIMEOUT_MS = 7000;
/** Hard cap on one note. */
const MAX_MS = 60_000;
/** First samples are room tone, used to set the bar for "speaking". */
const CALIBRATION_MS = 400;
/** How far above room tone counts as speech. */
const SPEECH_ABOVE_FLOOR_DB = 10;

/**
 * Metering is dBFS (≤ 0) on most devices, but some report linear amplitude.
 * Normalise both to dB so the silence logic works everywhere.
 */
function toDb(value: number): number {
  if (value > 0) return 20 * Math.log10(Math.max(value, 1) / 32767);
  return value;
}

/**
 * One press to talk. Recording ends by itself once you stop speaking (or press
 * again to end early), and the transcript is handed to `onTranscript`.
 *
 * If the device reports no input level, auto-stop is skipped and a second press
 * ends the recording — voice still works, just one press longer.
 */
export function useVoiceInput(onTranscript: (text: string) => void) {
  const recorder = useAudioRecorder(OPTIONS);
  const [stage, setStage] = useState<VoiceStage>('idle');
  const [error, setError] = useState<string | null>(null);
  /** 0..1, for the live meter. */
  const [level, setLevel] = useState(0);

  const stageRef = useRef<VoiceStage>('idle');
  const busy = useRef(false);
  const callback = useRef(onTranscript);
  callback.current = onTranscript;

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const session = useRef({
    startedAt: 0,
    samples: [] as number[],
    floor: null as number | null,
    heardSpeech: false,
    lastSpeechAt: 0,
    loudRun: 0,
  });

  const setStageBoth = (next: VoiceStage) => {
    stageRef.current = next;
    setStage(next);
  };

  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setLevel(0);
  };

  /** End recording. `transcribe: false` discards it. */
  const finish = useCallback(
    async (transcribe: boolean, message?: string) => {
      if (stageRef.current !== 'listening') return;
      stopTimer();
      try {
        await recorder.stop();
      } catch {
        // already stopped
      }

      if (!transcribe) {
        setStageBoth('idle');
        if (message) setError(message);
        return;
      }

      const uri = recorder.uri;
      if (!uri) {
        setStageBoth('idle');
        setError('Nothing was recorded.');
        return;
      }

      setStageBoth('transcribing');
      try {
        const text = await transcribeRecording(uri);
        setStageBoth('idle');
        callback.current(text);
      } catch (err) {
        setStageBoth('idle');
        setError(describeError(err));
      }
    },
    [recorder]
  );

  const sample = useCallback(() => {
    if (stageRef.current !== 'listening') return;
    const s = session.current;
    const now = Date.now();
    const elapsed = now - s.startedAt;

    if (elapsed >= MAX_MS) {
      void finish(true);
      return;
    }

    const raw = recorder.getStatus().metering;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      // No level on this device: rely on the second press.
      return;
    }
    const db = toDb(raw);

    if (s.floor === null) {
      s.samples.push(db);
      setLevel(0.08);
      if (elapsed >= CALIBRATION_MS && s.samples.length > 0) {
        const sorted = [...s.samples].sort((a, b) => a - b);
        s.floor = sorted[Math.floor(sorted.length / 2)];
      }
      return;
    }

    const threshold = s.floor + SPEECH_ABOVE_FLOOR_DB;
    setLevel(Math.max(0.08, Math.min(1, (db - s.floor) / 30)));

    if (db > threshold) {
      s.loudRun += 1;
      // Two loud samples in a row, so a single click or bump doesn't count.
      if (s.loudRun >= 2) {
        s.heardSpeech = true;
        s.lastSpeechAt = now;
      }
    } else {
      s.loudRun = 0;
    }

    if (s.heardSpeech && now - s.lastSpeechAt >= END_OF_SPEECH_MS) {
      void finish(true);
    } else if (!s.heardSpeech && elapsed >= NO_SPEECH_TIMEOUT_MS) {
      void finish(false, "Didn't hear anything. Press the mic and speak.");
    }
  }, [recorder, finish]);

  const start = useCallback(async () => {
    setError(null);

    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      setError('Microphone access is off. Turn it on in Settings to use voice.');
      return;
    }

    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();

    session.current = {
      startedAt: Date.now(),
      samples: [],
      floor: null,
      heardSpeech: false,
      lastSpeechAt: 0,
      loudRun: 0,
    };
    setStageBoth('listening');
    timer.current = setInterval(sample, SAMPLE_MS);
  }, [recorder, sample]);

  /** Press the mic: start, or end early and send. */
  const toggle = useCallback(async () => {
    if (busy.current || stageRef.current === 'transcribing') return;
    busy.current = true;
    try {
      if (stageRef.current === 'listening') {
        await finish(true);
      } else {
        await start();
      }
    } catch (err) {
      stopTimer();
      setStageBoth('idle');
      setError(describeError(err));
    } finally {
      busy.current = false;
    }
  }, [finish, start]);

  /** Throw the recording away. */
  const cancel = useCallback(() => {
    void finish(false);
  }, [finish]);

  // Never leave the mic open if the screen goes away mid-recording.
  useEffect(
    () => () => {
      if (stageRef.current === 'listening') {
        stopTimer();
        recorder.stop().catch(() => {});
      }
    },
    [recorder]
  );

  return {
    stage,
    level,
    error,
    toggle,
    cancel,
    clearError: () => setError(null),
  };
}
