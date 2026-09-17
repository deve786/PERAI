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
import { newVoiceActivityState, processSample, SAMPLE_MS } from './voiceActivity';

export type VoiceStage = 'idle' | 'listening' | 'transcribing';

// Module-level so the recorder hook receives a stable options object.
const OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

/**
 * One press to talk. Recording ends by itself once you stop speaking (or press
 * again to end early), and the transcript is handed to `onTranscript`. The
 * actual stop/continue decision lives in `voiceActivity.ts`, which is unit
 * tested; this hook only drives the timer and the native recorder.
 *
 * If the device reports no input level at all, auto-stop is skipped entirely
 * and a second press ends the recording. If it reports a level that never
 * moves (metering wired up but not actually live — seen on some Android
 * builds), that is treated the same way after a short check, rather than
 * mistaking "frozen" for "silent" and cutting the recording off immediately.
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
  const startedAt = useRef(0);
  const activity = useRef(newVoiceActivityState());

  const setStageBoth = (next: VoiceStage) => {
    stageRef.current = next;
    setStage(next);
  };

  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setLevel(0);
  };

  /** End recording. `transcribe: false` discards it without sending anything. */
  const finish = useCallback(
    async (transcribe: boolean) => {
      if (stageRef.current !== 'listening') return;
      stopTimer();
      try {
        await recorder.stop();
      } catch {
        // already stopped
      }

      if (!transcribe) {
        setStageBoth('idle');
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

    const elapsedMs = Date.now() - startedAt.current;
    const raw = recorder.getStatus().metering;
    const rawMetering = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;

    const shouldStop = processSample(activity.current, rawMetering, elapsedMs);
    setLevel(activity.current.level);

    if (shouldStop) void finish(true);
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

    startedAt.current = Date.now();
    activity.current = newVoiceActivityState();
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
