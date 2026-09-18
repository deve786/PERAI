import { acceptCorrection } from '../titleMatch';
import type { MemoryDraft, MemoryType } from '../types';
import { EXTRACT_MODEL, requestGroundedText } from './client';

export const SPELLING_MODEL =
  process.env.EXPO_PUBLIC_GEMINI_SPELLING_MODEL || EXTRACT_MODEL;

/** What each list holds, in the words the search prompt uses. */
const KIND: Partial<Record<MemoryType, string>> = {
  play: 'video game',
  watch: 'film, series or show',
  wish: 'product or item for sale',
};

const SYSTEM = `You correct titles that were dictated to a phone and written down by speech recognition, so the spelling is often wrong ("ghost of yachty" for "Ghost of Yōtei").

Search the web for the real thing the person means, then reply with ONLY its
official title — no quotes, no explanation, no punctuation you were not given,
nothing before or after it.

Keep it the same thing: correct the spelling, accents and capitalisation, but
never answer with a different title, a sequel, or a longer description. If
search does not turn up a title that is clearly the same one, reply with the
text exactly as you received it.`;

/**
 * Fix the spelling of one list item's name using a web search.
 *
 * Returns the corrected title, or the original when the search fails, is
 * unsure, or comes back with something that is not recognisably the same
 * title (see acceptCorrection).
 */
export async function correctSpelling(title: string, type: MemoryType): Promise<string> {
  const kind = KIND[type];
  if (!kind || !title.trim()) return title;

  try {
    const answer = await requestGroundedText({
      model: SPELLING_MODEL,
      system: SYSTEM,
      user: `This is meant to be the name of a ${kind}, heard through speech recognition: "${title}"`,
    });
    const suggestion = answer.trim();
    return acceptCorrection(title, suggestion) ? suggestion : title;
  } catch {
    // Offline, out of quota, or search unavailable: keep what was heard.
    return title;
  }
}

/**
 * Apply the spelling check to the drafts that are names of things — the play,
 * watch and wish lists. Everything else is the person's own wording and is
 * left exactly as they said it.
 */
export async function correctDraftSpellings(drafts: MemoryDraft[]): Promise<MemoryDraft[]> {
  const corrected: MemoryDraft[] = [];
  for (const draft of drafts) {
    // Sequential on purpose: the free tier is capped per minute, and a note
    // rarely holds more than one or two list items.
    corrected.push({ ...draft, title: await correctSpelling(draft.title, draft.type) });
  }
  return corrected;
}
