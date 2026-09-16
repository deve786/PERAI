import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { useCallback, useRef, useState } from 'react';
import { describeError } from './ai/client';
import { transcribeRecording } from './ai/transcribe';

export type VoiceStage = 'idle' | 'listening' | 'transcribing';

/**
 * Press to talk, press again to stop.
 *
 * The transcript is handed back to the caller rather than submitted, so both
 * tabs drop it into their own text field for you to check and edit first.
 */
export function useVoiceInput(onTranscript: (text: string) => void) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [stage, setStage] = useState<VoiceStage>('idle');
  const [error, setError] = useState<string | null>(null);

  // Guards a double-tap while the async start/stop is still in flight.
  const busy = useRef(false);

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
    setStage('listening');
  }, [recorder]);

  const stop = useCallback(async () => {
    await recorder.stop();
    const uri = recorder.uri;

    if (!uri) {
      setStage('idle');
      setError('Nothing was recorded.');
      return;
    }

    setStage('transcribing');
    try {
      onTranscript(await transcribeRecording(uri));
      setError(null);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setStage('idle');
    }
  }, [recorder, onTranscript]);

  const toggle = useCallback(async () => {
    if (busy.current || stage === 'transcribing') return;
    busy.current = true;
    try {
      if (stage === 'listening') {
        await stop();
      } else {
        await start();
      }
    } catch (err) {
      setStage('idle');
      setError(describeError(err));
    } finally {
      busy.current = false;
    }
  }, [stage, start, stop]);

  return { stage, error, toggle, clearError: () => setError(null) };
}
