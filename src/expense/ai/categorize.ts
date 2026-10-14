import { ASK_MODEL, describeError, hasApiKey, requestText } from './client';
import { addAiLog } from './logger';

const SYSTEM = 'You categorize personal expenses. Given an expense title and the user\'s '
  + 'existing category names, reply with the single best fit. Prefer an existing category '
  + 'when one genuinely fits. If none do, invent a short new category name instead (1-2 '
  + 'words, Title Case) rather than forcing it into an unrelated existing one — for example '
  + '"Barbershop" should become "Personal Care", not "Health". Reply with "Other" only when '
  + 'the title is too vague to categorize at all. Reply with the category name alone, '
  + 'nothing else, no punctuation.';

const MAX_NAME_LENGTH = 24;

/**
 * Best-effort category guess for a title the local keyword list didn't recognize.
 * May return a category name that doesn't exist yet — the caller is responsible for
 * creating it (via findOrCreateCategory) if so. Returns null on any failure (no key
 * configured, rate limit, network, an unparsable/too-long reply) — the caller already
 * has "Other" selected as a safe fallback, so there's nothing to show the user beyond
 * hiding the loading state.
 */
export async function guessCategoryWithAI(title: string, categoryNames: string[]): Promise<string | null> {
  const trimmed = title.trim();
  if (!trimmed) return null;

  if (!hasApiKey()) {
    addAiLog({
      type: 'categorize',
      title: trimmed,
      status: 'error',
      error: 'No Gemini API key configured. Add EXPO_PUBLIC_GEMINI_API_KEY to .env and restart Expo with --clear.',
      model: ASK_MODEL,
    });
    return null;
  }

  try {
    const reply = await requestText({
      model: ASK_MODEL,
      system: SYSTEM,
      user: `Existing categories: ${categoryNames.join(', ')}\nExpense title: "${trimmed}"`,
      retries: 0,
    });
    const clean = reply.trim().replace(/^["'.]+|["'.]+$/g, '');
    if (!clean || clean.length > MAX_NAME_LENGTH) {
      addAiLog({
        type: 'categorize',
        title: trimmed,
        status: 'error',
        error: `Model returned invalid/too long category name: "${clean}"`,
        model: ASK_MODEL,
      });
      return null;
    }

    addAiLog({
      type: 'categorize',
      title: trimmed,
      status: 'success',
      result: clean,
      model: ASK_MODEL,
    });

    return clean;
  } catch (err) {
    const errDesc = describeError(err);
    addAiLog({
      type: 'categorize',
      title: trimmed,
      status: 'error',
      error: errDesc,
      model: ASK_MODEL,
    });
    return null;
  }
}
