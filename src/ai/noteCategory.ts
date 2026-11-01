import { ASK_MODEL, hasApiKey, requestText } from '../expense/ai/client';
import { readCategoryGuess } from '../notesLogic';

const SYSTEM = 'You file personal notes under a category. Given a note title and the names of '
  + 'the categories the person already uses, reply with the single best fit. Prefer an existing '
  + 'category when one genuinely fits. If none do, invent a short new category name instead '
  + '(1-2 words, Title Case) rather than forcing the note into an unrelated one. Reply with '
  + '"Other" only when the title is too vague to place at all. Reply with the category name '
  + 'alone, nothing else, no punctuation.';

/**
 * Best-effort category for a note, from its title. Returns an existing category
 * name, a new one to offer, or null when nothing fits or the AI is unavailable —
 * the note then simply stays in the category already chosen.
 */
export async function guessNoteCategory(
  title: string,
  existing: string[]
): Promise<{ kind: 'existing' | 'new'; name: string } | null> {
  const text = title.trim();
  if (!text || !hasApiKey()) return null;
  try {
    const reply = await requestText({
      model: ASK_MODEL,
      system: SYSTEM,
      user: `Existing categories: ${existing.join(', ')}\nNote title: "${text}"`,
      retries: 0,
    });
    return readCategoryGuess(reply, existing);
  } catch {
    return null;
  }
}
