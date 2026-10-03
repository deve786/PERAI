import { acceptCorrection } from '../titleMatch';
import type { MemoryType } from '../types';
import { EXTRACT_MODEL, requestGroundedText, requestText } from './client';
import { isQuotaError, quotaWait } from './quota';

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

/**
 * Searching the web has its own small allowance, and once it is gone every
 * further attempt costs a slow refusal before the fallback can even start —
 * which is most of the minute people wait. So the first refusal stands for the
 * rest of the day: until this moment passes, lookups go straight to the
 * model's own knowledge.
 */
let searchBlockedUntil = 0;

export function searchAvailable(now: Date = new Date()): boolean {
  return now.getTime() >= searchBlockedUntil;
}

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, fail) =>
      setTimeout(() => fail(new Error('Spelling search timed out.')), SEARCH_TIMEOUT_MS)
    ),
  ]);
}

/** One attempt made while looking a name up, for the activity log. */
export interface LookupStep {
  route: 'web search' | 'model knowledge';
  seconds: number;
  /** Why this route gave nothing, when it did not. */
  failure?: string;
}

export interface TitleLookup {
  /** Every attempt, in order, so the time spent is never unexplained. */
  steps: LookupStep[];
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

  let replied = '';
  let source: TitleLookup['source'] = 'web search';
  const steps: LookupStep[] = [];
  const since = (from: number) => Math.round((Date.now() - from) / 1000);

  if (searchAvailable()) {
    const began = Date.now();
    try {
      replied = await withTimeout(
        // No retry: a refusal here is answered by asking the model directly,
        // which is faster than waiting out a rate limit for a second refusal.
        requestGroundedText({ model: SPELLING_MODEL, system: SYSTEM, user, retries: 0 })
      );
      steps.push({ route: 'web search', seconds: since(began) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isQuotaError(message)) searchBlockedUntil = quotaWait(message).retryAt.getTime();
      steps.push({ route: 'web search', seconds: since(began), failure: message.slice(0, 120) });
      source = 'model knowledge';
    }
  } else {
    steps.push({
      route: 'web search',
      seconds: 0,
      failure: 'skipped — no search allowance left today',
    });
    source = 'model knowledge';
  }

  if (source === 'model knowledge') {
    // The model knows most titles without looking them up. If this fails too,
    // the caller retries later.
    const began = Date.now();
    try {
      replied = await withTimeout(
        requestText({ model: SPELLING_MODEL, system: KNOWLEDGE_SYSTEM, user })
      );
      steps.push({ route: 'model knowledge', seconds: since(began) });
    } catch (err) {
      steps.push({
        route: 'model knowledge',
        seconds: since(began),
        failure: err instanceof Error ? err.message.slice(0, 120) : String(err),
      });
      throw Object.assign(err instanceof Error ? err : new Error(String(err)), { steps });
    }
  }

  const suggestion = replied.trim();
  return {
    steps,
    source,
    model: SPELLING_MODEL,
    replied: suggestion,
    accepted: acceptCorrection(title, suggestion)
      ? suggestion.replace(/^["']|["']$/g, '')
      : null,
    seconds: Math.round((Date.now() - started) / 1000),
  };
}
