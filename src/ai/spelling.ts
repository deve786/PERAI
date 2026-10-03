import { acceptCorrection } from '../titleMatch';
import type { MemoryType } from '../types';
import { EXTRACT_MODEL, requestText } from './client';

export const SPELLING_MODEL =
  process.env.EXPO_PUBLIC_GEMINI_SPELLING_MODEL || EXTRACT_MODEL;

/** What each list holds, in the words the prompt uses. */
const KIND: Partial<Record<MemoryType, string>> = {
  play: 'video game',
  watch: 'film, series or show',
  wish: 'product or item for sale',
};

/** Only the three lists hold names of things; everything else is your wording. */
export function canSearch(type: MemoryType): boolean {
  return KIND[type] !== undefined;
}

/**
 * Asked without a web search.
 *
 * Grounding the question in a live Google search was the original design, and
 * it is the better authority for something released last week. But on this key
 * every grounded request is refused — measured repeatedly, spaced apart — and
 * each refusal costs about 35 seconds before anything useful can happen. The
 * model's own knowledge answers in about 4 seconds and has been right every
 * time, including a 2025 title, so it is the whole of the job now.
 *
 * What this gives up: a name too new or too obscure for the model's training.
 * Those keep the spelling as dictated, which is what happened anyway while
 * search was failing.
 */
const SYSTEM = `You correct names that were dictated to a phone and written down by speech recognition, so the spelling is often wrong ("ghost of yachty" for "Ghost of Yōtei").

Give ONLY the official title of the thing the person means — no quotes, no
explanation, nothing before or after it.

Answer from what you already know. Keep it the same thing: correct the
spelling, accents and capitalisation, but never answer with a different title,
a sequel, or a longer description. If you do not actually recognise what they
mean, repeat the text exactly as you received it rather than guessing.`;

/** Long enough for a slow network, short enough not to hang on. */
const TIMEOUT_MS = 60_000;

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, fail) =>
      setTimeout(() => fail(new Error('Spelling check timed out.')), TIMEOUT_MS)
    ),
  ]);
}

/** One attempt made while looking a name up, for the activity log. */
export interface LookupStep {
  route: 'model knowledge';
  seconds: number;
  /** Why this route gave nothing, when it did not. */
  failure?: string;
}

export interface TitleLookup {
  /** Every attempt, in order, so the time spent is never unexplained. */
  steps: LookupStep[];
  source: 'model knowledge';
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
 * Reports what actually happened — what was asked, what it said, and whether
 * that was accepted — so the activity log can show the work rather than only
 * the verdict. `acceptCorrection` is what stops an answer that wandered off to
 * a different title from being saved over yours.
 *
 * Throws if the call fails — offline, out of quota, timed out — so the caller
 * can try again later rather than mistaking a failure for "the spelling was
 * already right".
 */
export async function lookUpTitle(
  title: string,
  type: MemoryType
): Promise<TitleLookup | null> {
  if (!canSearch(type) || !title.trim()) return null;

  const began = Date.now();
  const since = () => Math.round((Date.now() - began) / 1000);

  let replied: string;
  try {
    replied = await withTimeout(
      requestText({
        model: SPELLING_MODEL,
        system: SYSTEM,
        user: `This is meant to be the name of a ${KIND[type]}, heard through speech recognition: "${title}"`,
      })
    );
  } catch (err) {
    const failure = err instanceof Error ? err.message.slice(0, 120) : String(err);
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), {
      steps: [{ route: 'model knowledge', seconds: since(), failure }] as LookupStep[],
    });
  }

  const suggestion = replied.trim();
  const seconds = since();
  return {
    steps: [{ route: 'model knowledge', seconds }],
    source: 'model knowledge',
    model: SPELLING_MODEL,
    replied: suggestion,
    accepted: acceptCorrection(title, suggestion)
      ? suggestion.replace(/^["']|["']$/g, '')
      : null,
    seconds,
  };
}
