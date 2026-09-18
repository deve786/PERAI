import { lookupSpelling, type Spelling } from '../dictionary';
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

const SYSTEM = `You correct names that were dictated to a phone and written down by speech recognition, so the spelling is often wrong ("ghost of yachty" for "Ghost of Yōtei").

Search the web for the real thing the person means, then give ONLY its official
title — no quotes, no explanation, nothing before or after it.

Keep it the same thing: correct the spelling, accents and capitalisation, but
never answer with a different title, a sequel, or a longer description. If
search does not turn up a title that is clearly the same one, repeat the text
exactly as you received it.`;

export interface SpellingResult {
  drafts: MemoryDraft[];
  /** Spellings confirmed by search, for the caller to remember. */
  learned: { heard: string; correct: string }[];
  /** Titles that changed, for the caller to show. */
  changed: { from: string; to: string }[];
}

function needsCheck(draft: MemoryDraft): boolean {
  return KIND[draft.type] !== undefined && draft.title.trim().length > 0;
}

async function searchOne(title: string, type: MemoryType): Promise<string> {
  const answer = await requestGroundedText({
    model: SPELLING_MODEL,
    system: SYSTEM,
    user: `This is meant to be the name of a ${KIND[type]}, heard through speech recognition: "${title}"`,
  });
  return answer.trim();
}

/** One call for a note that mentioned several things, answered line by line. */
async function searchMany(items: MemoryDraft[]): Promise<string[]> {
  const list = items
    .map((draft, index) => `${index + 1}. ${draft.title}  (${KIND[draft.type]})`)
    .join('\n');
  const answer = await requestGroundedText({
    model: SPELLING_MODEL,
    system: SYSTEM,
    user:
      `Each line below is a name heard through speech recognition, with what kind of thing it is.\n` +
      `Reply with exactly ${items.length} lines, numbered the same way, each holding only the corrected title.\n\n${list}`,
  });

  const lines = answer
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean);
  return lines.length === items.length ? lines : [];
}

/**
 * Put the right spelling on the names of games, films and products.
 *
 * Checked in order of cost: what the app already knows (corrections you typed,
 * spellings it looked up before, titles already in your record), and only then
 * a web search for what is genuinely new. Everything that is not one of the
 * three lists is the person's own wording and is left exactly as said.
 *
 * Any failure — offline, out of quota, an answer that is not recognisably the
 * same title — keeps the title as heard. The note always saves.
 */
export async function correctDraftSpellings(
  drafts: MemoryDraft[],
  known: Spelling[] = []
): Promise<SpellingResult> {
  const result: SpellingResult = { drafts: [...drafts], learned: [], changed: [] };

  const apply = (index: number, corrected: string) => {
    const before = result.drafts[index].title;
    if (corrected === before) return;
    result.drafts[index] = { ...result.drafts[index], title: corrected };
    result.changed.push({ from: before, to: corrected });
  };

  const unknown: number[] = [];
  drafts.forEach((draft, index) => {
    if (!needsCheck(draft)) return;
    const remembered = lookupSpelling(draft.title, known);
    if (remembered) apply(index, remembered);
    else if (!known.some((entry) => entry.correct === draft.title)) unknown.push(index);
  });

  if (unknown.length === 0) return result;

  try {
    const answers =
      unknown.length > 1 ? await searchMany(unknown.map((i) => result.drafts[i])) : [];

    for (const [position, index] of unknown.entries()) {
      const heard = result.drafts[index].title;
      const suggestion =
        answers.length > 0
          ? answers[position]
          : await searchOne(heard, result.drafts[index].type);

      if (acceptCorrection(heard, suggestion)) {
        const corrected = suggestion.trim().replace(/^["']|["']$/g, '');
        apply(index, corrected);
        result.learned.push({ heard, correct: corrected });
      }
    }
  } catch {
    // Offline, out of quota, or search unavailable: keep what was heard.
  }

  return result;
}
