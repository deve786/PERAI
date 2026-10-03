import { acceptCorrection } from '../titleMatch';
import type { MemoryType } from '../types';
import { EXTRACT_MODEL, requestGroundedText, requestText } from './client';

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

/** The same job, from memory rather than the web. */
const KNOWLEDGE_SYSTEM = `${SYSTEM}

You cannot search right now, so answer from what you already know. Only correct
a title you actually recognise; if you are not sure what the person means,
repeat the text exactly as you received it rather than guessing.`;

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

export interface TitleLookup {
  /** Whether the answer came from a web search or the model's own knowledge. */
  source: 'web search' | 'model knowledge';
  model: string;
  /** Exactly what the model replied, before any judgement. */
  replied: string;
  /** The reply, if it was judged to be the same title properly spelled. */
  accepted: string | null;
  /** How long the call took, in seconds. */
  seconds: number;
}

/**
 * Look up how a dictated name is really spelled.
 *
 * Reports what actually happened — which route answered, what it said, and
 * whether that was accepted — so the activity log can show the work rather
 * than only the verdict. `acceptCorrection` is what stops an answer that
 * wandered off to a different title from being saved over yours.
 *
 * Throws if both routes fail — offline, out of quota, timed out — so the
 * caller can try again later rather than mistaking a failure for "the
 * spelling was already right".
 */
export async function lookUpTitle(
  title: string,
  type: MemoryType
): Promise<TitleLookup | null> {
  if (!canSearch(type) || !title.trim()) return null;
  const user = `This is meant to be the name of a ${KIND[type]}, heard through speech recognition: "${title}"`;
  const started = Date.now();

  let replied: string;
  let source: TitleLookup['source'] = 'web search';
  try {
    replied = await withTimeout(
      requestGroundedText({ model: SPELLING_MODEL, system: SYSTEM, user })
    );
  } catch {
    // Searching the web has its own, much smaller allowance than ordinary
    // calls, and it is the first thing to run out. The model knows most
    // titles without looking them up, so ask it directly rather than leaving
    // the name misspelled. If this fails too, the caller retries later.
    source = 'model knowledge';
    replied = await withTimeout(
      requestText({ model: SPELLING_MODEL, system: KNOWLEDGE_SYSTEM, user })
    );
  }

  const suggestion = replied.trim();
  return {
    source,
    model: SPELLING_MODEL,
    replied: suggestion,
    accepted: acceptCorrection(title, suggestion)
      ? suggestion.replace(/^["']|["']$/g, '')
      : null,
    seconds: Math.round((Date.now() - started) / 1000),
  };
}
