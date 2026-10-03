import { extractMemories } from './ai/extract';
import { correctDraftSpellings } from './ai/spelling';
import { getSpellings, insertMemory, rememberSpelling, updateMemoryTitle } from './db/queries';
import { lookupSpelling, spellingKey, type Spelling } from './dictionary';
import type { Memory } from './types';

export interface FilingContext {
  /** Names already in the record, for the extraction model. */
  people?: string[];
  /** Titles already on the play/watch/wish lists — free, exact spellings. */
  listTitles?: string[];
}

async function knownSpellings(context: FilingContext): Promise<Spelling[]> {
  const recorded: Spelling[] = (context.listTitles ?? []).map((title) => ({
    heard: spellingKey(title),
    correct: title,
  }));
  return [...(await getSpellings()), ...recorded];
}

/**
 * Turn one written or spoken note into stored entries.
 *
 * Only what is needed to store the note happens here: understand it, apply any
 * spelling the app already knows (free, from the phone), and save. A web search
 * for a title nobody has seen before takes far longer than the rest put
 * together, so it does not happen here — see refineSpellings below.
 *
 * Shared by saving on the Record tab and by the retry of a queued note.
 */
export async function fileNote(text: string, context: FilingContext = {}): Promise<Memory[]> {
  const drafts = await extractMemories(text, new Date().toISOString(), context.people ?? [], {
    // A failure here goes to the pending queue, which retries on its own
    // schedule. Waiting out a rate limit in front of the person is the one
    // thing that must not happen.
    retries: 0,
  });

  const known = await knownSpellings(context);
  const memories: Memory[] = [];
  for (const draft of drafts) {
    const remembered = lookupSpelling(draft.title, known);
    memories.push(await insertMemory(remembered ? { ...draft, title: remembered } : draft, text));
  }
  return memories;
}

/**
 * Check any new game, film or product name against a web search, after the
 * entry is already saved and on screen.
 *
 * The search can take a minute and a half, which is unusable in front of
 * someone who just spoke a note. Running it afterwards means the entry appears
 * at once and quietly gains its proper spelling a moment later — and because
 * the title is a normal edit, the corrected version syncs like any other
 * change.
 *
 * Returns the titles that changed; failures are silent, leaving what was heard.
 */
export async function refineSpellings(
  memories: Memory[],
  context: FilingContext = {}
): Promise<{ from: string; to: string }[]> {
  try {
    const known = await knownSpellings(context);
    const { learned, changed } = await correctDraftSpellings(memories, known);

    for (const spelling of learned) {
      await rememberSpelling(spelling.heard, spelling.correct, 'search');
    }
    for (const fix of changed) {
      const entry = memories.find((memory) => memory.title === fix.from);
      if (entry) await updateMemoryTitle(entry.id, fix.to);
    }
    return changed;
  } catch {
    return [];
  }
}
