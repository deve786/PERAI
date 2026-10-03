/**
 * Pure decision logic for when a live-captioned voice recording should end —
 * either because you went quiet, or because you said a stop phrase. Kept
 * separate from useVoiceInput.ts (which owns the actual speech-recognition
 * session) so it is unit tested in plain Node, the same discipline that
 * caught a real bug in the previous, audio-level version of this file.
 */

/** Quiet this long after the last recognized word = finished. */
export const END_OF_SPEECH_MS = 5000;
/** Nothing recognized at all this long after pressing = give up. */
export const SAFETY_STOP_MS = 10_000;
/** Hard cap on one note, if speech keeps being recognized right up to it. */
export const MAX_MS = 60_000;

/**
 * @param hadSpeech               anything recognized yet, this recording?
 * @param elapsedSinceStartMs     time since the mic was pressed
 * @param elapsedSinceLastEventMs time since the last interim or final result
 */
export function shouldFinish(
  hadSpeech: boolean,
  elapsedSinceStartMs: number,
  elapsedSinceLastEventMs: number
): boolean {
  if (elapsedSinceStartMs >= MAX_MS) return true;
  if (hadSpeech) return elapsedSinceLastEventMs >= END_OF_SPEECH_MS;
  return elapsedSinceStartMs >= SAFETY_STOP_MS;
}

const DEFAULT_STOP_PHRASES = ['stop listening', 'stop recording', 'stop'];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?]+$/g, '')
    .trim();
}

/**
 * Is this one recognized segment basically just one of the given phrases,
 * rather than a sentence that happens to mention it? Deliberately
 * conservative: the phrase must be close to the whole segment, not merely
 * contained in it — "remind me to stop listening to that podcast" must never
 * match "stop listening" just because it mentions the words. Used for both
 * the stop phrase in useVoiceInput.ts.
 *
 * @param segmentText the text recognized since the last pause (not the whole
 *                     accumulated note — see useVoiceInput.ts)
 */
export function matchesTrailingPhrase(segmentText: string, phrases: readonly string[]): boolean {
  const segment = normalize(segmentText);
  if (!segment) return false;

  return phrases.some((raw) => {
    const phrase = normalize(raw);
    if (!phrase || !segment.endsWith(phrase)) return false;
    // Allow a short lead-in ("okay, stop listening") but not a whole other
    // sentence tacked on before it.
    const extraWords = segment.slice(0, segment.length - phrase.length).trim().split(/\s+/).filter(Boolean);
    return extraWords.length <= 2;
  });
}

/** @param stopPhrases see {@link matchesTrailingPhrase} */
export function isStopCommand(
  segmentText: string,
  stopPhrases: readonly string[] = DEFAULT_STOP_PHRASES
): boolean {
  return matchesTrailingPhrase(segmentText, stopPhrases);
}
