/**
 * Turns a stream of microphone metering samples into a stop/continue
 * decision for one voice recording.
 *
 * Pulled out of useVoiceInput.ts so the decision logic is testable in plain
 * Node (scripts/test-logic.ts) without a real recorder or microphone —
 * exactly the class of bug ("looks right on paper, never verified against
 * real audio") that let auto-stop silently never fire on-device. The caller
 * owns the timer and the actual `expo-audio` recorder; this module only ever
 * sees numbers.
 */

export const SAMPLE_MS = 100;
/**
 * Quiet this long after speaking = finished, matching the pause-to-finish feel
 * of Gemini/ChatGPT voice input rather than cutting off the moment you take a
 * breath. Tapping the mic again still ends it immediately for anyone who
 * doesn't want to wait out the pause.
 */
export const END_OF_SPEECH_MS = 5000;
/**
 * Loud speech was never confidently detected this long after pressing — stop
 * anyway and let transcription's own silence check have the final say,
 * rather than trusting this on-device heuristic to decide there was nothing
 * there (which would otherwise mean throwing away a real recording).
 */
export const SAFETY_STOP_MS = 10_000;
/** If the metering level never moves at all, treat it as broken and stop sooner. */
export const UNRELIABLE_METERING_STOP_MS = 15_000;
/** Hard cap on one note, when speech keeps being detected right up to it. */
export const MAX_MS = 60_000;
/** First samples seed the initial guess at room tone. */
export const CALIBRATION_MS = 500;
/** How far above the (continuously corrected) floor counts as speech. */
export const SPEECH_ABOVE_FLOOR_DB = 10;
/**
 * Unmistakably loud regardless of how the floor calibrated. A safety net for
 * when the floor was accidentally calibrated on speech (see `processSample`).
 */
export const ABSOLUTE_SPEECH_DB = -28;
/** How long to watch for the level moving at all before judging it frozen. */
export const VARIANCE_WINDOW_MS = 1500;
export const VARIANCE_EPSILON_DB = 1;

export interface VoiceActivityState {
  samples: number[];
  floor: number | null;
  heardSpeech: boolean;
  lastSpeechAt: number;
  loudRun: number;
  minSeen: number;
  maxSeen: number;
  /** null = still deciding, then locked true/false for the rest of the recording. */
  meteringReliable: boolean | null;
  /** 0..1, for the live meter. Left unchanged on ticks with nothing to report. */
  level: number;
}

export function newVoiceActivityState(): VoiceActivityState {
  return {
    samples: [],
    floor: null,
    heardSpeech: false,
    lastSpeechAt: 0,
    loudRun: 0,
    minSeen: Infinity,
    maxSeen: -Infinity,
    meteringReliable: null,
    level: 0,
  };
}

/**
 * Metering is dBFS (≤ 0) on most devices, but some report linear amplitude.
 * Normalise both to dB so the silence logic works everywhere.
 */
export function toDb(value: number): number {
  if (value > 0) return 20 * Math.log10(Math.max(value, 1) / 32767);
  return value;
}

/**
 * Feed one metering sample (or `null` when the device reports no level at
 * all this tick) at a known elapsed time since recording started. Mutates
 * `state` in place, including `state.level`. Returns whether the caller
 * should stop the recording and hand it to transcription now.
 */
export function processSample(
  state: VoiceActivityState,
  rawMetering: number | null,
  elapsedMs: number
): boolean {
  if (elapsedMs >= MAX_MS) return true;

  if (rawMetering === null) {
    // No level reported at all on this device: rely on the caller's manual
    // stop path instead.
    return false;
  }

  const db = toDb(rawMetering);

  // Some devices report metering that never actually changes. Left
  // undetected, that reads identically to "the room went silent" and would
  // stop the recording the moment it starts. Watch for real movement first.
  if (db < state.minSeen) state.minSeen = db;
  if (db > state.maxSeen) state.maxSeen = db;
  if (state.meteringReliable === null && elapsedMs >= VARIANCE_WINDOW_MS) {
    state.meteringReliable = state.maxSeen - state.minSeen > VARIANCE_EPSILON_DB;
  }
  if (state.meteringReliable === false) {
    return elapsedMs >= UNRELIABLE_METERING_STOP_MS;
  }

  if (state.floor === null) {
    state.samples.push(db);
    state.level = 0.08;
    if (elapsedMs >= CALIBRATION_MS && state.samples.length > 0) {
      const sorted = [...state.samples].sort((a, b) => a - b);
      state.floor = sorted[Math.floor(sorted.length / 2)];
    }
    return false;
  }

  // Keep chasing the true ambient floor down for the whole recording. This
  // corrects a floor that got calibrated on speech rather than silence —
  // which happens whenever someone starts talking the instant they press
  // the mic, before the brief calibration window above has any quiet to
  // measure. A single quiet moment (a breath, a pause between words) then
  // pulls the floor back down to where it should have started.
  if (db < state.floor) state.floor = db;

  const threshold = state.floor + SPEECH_ABOVE_FLOOR_DB;
  state.level = Math.max(0.08, Math.min(1, (db - state.floor) / 30));

  // A floor that is still wrong for some other reason should not be able to
  // hide unmistakably loud speech — this is an OR, not a replacement.
  const isLoud = db > threshold || db > ABSOLUTE_SPEECH_DB;

  if (isLoud) {
    state.loudRun += 1;
    // Two loud samples in a row, so a single click or bump doesn't count.
    if (state.loudRun >= 2) {
      state.heardSpeech = true;
      state.lastSpeechAt = elapsedMs;
    }
  } else {
    state.loudRun = 0;
  }

  return state.heardSpeech
    ? elapsedMs - state.lastSpeechAt >= END_OF_SPEECH_MS
    : elapsedMs >= SAFETY_STOP_MS;
}
