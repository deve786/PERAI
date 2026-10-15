import { canSearch } from './ai/spelling';
import { extractMemories } from './ai/extract';
import { getSpellings, insertMemory, queueTitleCheck } from './db/queries';
import { lookupSpelling, spellingKey, type Spelling } from './dictionary';
import { recordVoiceExpense } from './expense/voiceExpense';
import type { Memory } from './types';

export interface FilingContext {
  /** Names already in the record, for the extraction model. */
  people?: string[];
  /** Titles already on the play/watch/wish lists — free, exact spellings. */
  listTitles?: string[];
}

/**
 * Turn one written or spoken note into stored entries.
 *
 * Only what is needed to store the note happens here: understand it, apply any
 * spelling the app already knows — a correction you typed, something searched
 * before, a title already on your lists — and save. A web search for a name
 * nobody has seen before takes longer than all of this put together, so the
 * entry is queued for checking instead and the search happens behind you (see
 * useTitleChecks.ts).
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

  const recorded: Spelling[] = (context.listTitles ?? []).map((title) => ({
    heard: spellingKey(title),
    correct: title,
  }));
  const stored = await getSpellings();
  const known = [...stored, ...recorded];

  const memories: Memory[] = [];
  for (const draft of drafts) {
    const remembered = lookupSpelling(draft.title, known);
    const memory = await insertMemory(
      remembered ? { ...draft, title: remembered } : draft,
      text
    );

    // If this entry is a purchase with a valid amount, seamlessly record it
    // into the Expense Tracker database so voice purchases are immediately accounted for.
    if (draft.type === 'purchase' && draft.amount !== null && draft.amount > 0) {
      try {
        const expenseId = await recordVoiceExpense({
          title: memory.title,
          category: memory.category,
          eventDate: memory.eventDate,
          amount: draft.amount,
          rawInput: text,
        });
        memory.expenseId = expenseId;
      } catch (err) {
        console.warn('Could not auto-record expense for purchase:', err);
      }
    }

    memories.push(memory);

    // Worth a search only for a name, and only when the app has not already
    // confirmed that exact spelling before. Note this looks at what has been
    // *confirmed*, not at what is merely in the record — the entry just saved
    // is in the record, and treating that as known is what stopped dictated
    // names from ever being checked.
    const confirmed = stored.some((entry) => entry.correct === memory.title);
    if (canSearch(memory.type) && !confirmed) {
      await queueTitleCheck(memory.id, memory.title, memory.type);
    }
  }
  return memories;
}
