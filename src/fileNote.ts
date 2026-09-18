import { extractMemories } from './ai/extract';
import { correctDraftSpellings } from './ai/spelling';
import { getSpellings, insertMemory, rememberSpelling } from './db/queries';
import { spellingKey, type Spelling } from './dictionary';
import type { Memory } from './types';

export interface FiledNote {
  memories: Memory[];
  /** Titles a web search corrected, so the screen can say what it saved. */
  changed: { from: string; to: string }[];
}

export interface FilingContext {
  /** Names already in the record, for the extraction model. */
  people?: string[];
  /** Titles already on the play/watch/wish lists — free, exact spellings. */
  listTitles?: string[];
}

/**
 * Turn one written or spoken note into stored entries.
 *
 * Shared by saving on the Record tab and by the retry of a note that was
 * queued when this failed, so both take exactly the same path: understand the
 * note, put the right spelling on any game, film or product named in it,
 * remember what was learned, then store it.
 */
export async function fileNote(text: string, context: FilingContext = {}): Promise<FiledNote> {
  const drafts = await extractMemories(text, new Date().toISOString(), context.people ?? []);

  const recorded: Spelling[] = (context.listTitles ?? []).map((title) => ({
    heard: spellingKey(title),
    correct: title,
  }));
  const known = [...(await getSpellings()), ...recorded];

  const { drafts: checked, learned, changed } = await correctDraftSpellings(drafts, known);
  for (const spelling of learned) {
    await rememberSpelling(spelling.heard, spelling.correct, 'search');
  }

  const memories: Memory[] = [];
  for (const draft of checked) memories.push(await insertMemory(draft, text));
  return { memories, changed };
}
