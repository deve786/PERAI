import { acceptCorrection } from '../titleMatch';
import type { MemoryType } from '../types';
import { EXTRACT_MODEL, requestGroundedText } from './client';

export const SPELLING_MODEL =
  process.env.EXPO_PUBLIC_GEMINI_SPELLING_MODEL || EXTRACT_MODEL;

/** What each list holds, in the words the search prompt uses. */
const KIND: Partial<Record<MemoryType, string>> = {
  play: 'video game',
  watch: 'film, series or show',
  wish: 'product or item for sale',
};

/** Only the three lists hold names of things; everything else is your wording. */
export function canSearch(type: MemoryType): boolean {
  return KIND[type] !== undefined;
}

const SYSTEM = `You correct names that were dictated to a phone and written down by speech recognition, so the spelling is often wrong ("ghost of yachty" for "Ghost of Yōtei").

Search the web for the real thing the person means, then give ONLY its official
title — no quotes, no explanation, nothing before or after it.

Keep it the same thing: correct the spelling, accents and capitalisation, but
never answer with a different title, a sequel, or a longer description. If
search does not turn up a title that is clearly the same one, repeat the text
exactly as you received it.`;

/** The search is slow by nature, but it must not hang on for ever. */
const SEARCH_TIMEOUT_MS = 120_000;

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, fail) =>
      setTimeout(() => fail(new Error('Spelling search timed out.')), SEARCH_TIMEOUT_MS)
    ),
  ]);
}

/**
 * The properly spelled name for something dictated, or null when the search
 * cannot better it.
 *
 * Throws if the search itself fails — offline, out of quota, timed out — so
 * the caller can try again later rather than mistaking a failure for "the
 * spelling was already right". `acceptCorrection` is what stops a search that
 * wandered off to a different title from being saved over yours.
 */
export async function searchTitle(title: string, type: MemoryType): Promise<string | null> {
  if (!canSearch(type) || !title.trim()) return null;

  const answer = await withTimeout(
    requestGroundedText({
      model: SPELLING_MODEL,
      system: SYSTEM,
      user: `This is meant to be the name of a ${KIND[type]}, heard through speech recognition: "${title}"`,
    })
  );

  const suggestion = answer.trim();
  if (!acceptCorrection(title, suggestion)) return null;
  return suggestion.replace(/^["']|["']$/g, '');
}
