import { useEffect } from 'react';
import { useShareIntentContext } from 'expo-share-intent';
import { describeError } from './ai/client';
import { deleteMemories, queueNote } from './db/queries';
import { showDialog } from './dialogStore';
import { deleteExpense } from './expense/db';
import { fileNote } from './fileNote';
import { logFail, logOk } from './log';
import type { Memory } from './types';

/**
 * Files whatever text gets shared into PERAI from another app — GPay's
 * "Share" on a payment, chiefly — the same way a typed or spoken note is
 * filed. "₹500 paid to Ramesh" becomes a purchase without opening the
 * Expense form at all; the result is confirmed with Undo, the same courtesy
 * a typed or spoken entry gets on the Record tab.
 *
 * Lives at the root rather than on one screen, since a share can arrive
 * while you're anywhere in the app — the dialog it ends with works from
 * anywhere too.
 */
export function useShareIntentCapture() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  useEffect(() => {
    if (!hasShareIntent) return;
    const text = shareIntent.text?.trim();
    // Claimed immediately so a re-render (or the next share) never re-files
    // the same text twice.
    resetShareIntent();
    if (text) void handle(text);
  }, [hasShareIntent, shareIntent.text, resetShareIntent]);
}

async function handle(text: string) {
  try {
    const kept = await fileNote(text);
    const expenseIds = kept.map((m) => m.expenseId).filter((id): id is string => Boolean(id));
    const headline = kept.map((m) => m.title).join(', ');

    logOk(
      kept.length === 1 ? 'Filed a shared payment' : `Filed ${kept.length} entries from a share`,
      headline
    );
    showDialog({
      title: 'Added from share',
      message: headline || 'Saved.',
      actions: [
        { label: 'Undo', destructive: true, onPress: () => void undo(kept, expenseIds) },
        { label: 'OK' },
      ],
    });
  } catch (err) {
    // Same safety net a typed note gets: nothing shared is lost, it is just
    // filed automatically once whatever failed is working again.
    await queueNote(text, describeError(err));
    logFail('Could not file a shared payment, queued', describeError(err));
  }
}

async function undo(memories: Memory[], expenseIds: string[]) {
  await deleteMemories(memories.map((m) => m.id));
  for (const id of expenseIds) {
    await deleteExpense(id).catch(() => {});
  }
}
