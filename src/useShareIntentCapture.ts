import { useEffect } from 'react';
import { File } from 'expo-file-system';
import { useShareIntentContext, type ShareIntentFile } from 'expo-share-intent';
import { describeError } from './ai/client';
import { deleteMemories, queueNote } from './db/queries';
import { showDialog } from './dialogStore';
import { deleteExpense } from './expense/db';
import { scanPaymentWithAI } from './expense/ai/ocr';
import { fileNote } from './fileNote';
import { logFail, logOk } from './log';
import type { Memory } from './types';

/**
 * Files whatever gets shared into PERAI from another app — GPay's "Share" on
 * a payment, chiefly — the same way a typed or spoken note is filed.
 * "₹500 paid to Ramesh" becomes a purchase without opening the Expense form
 * at all; the result is confirmed with Undo, the same courtesy a typed or
 * spoken entry gets on the Record tab.
 *
 * GPay's own Share button sends an image of the payment card, not text, so a
 * shared image is read with the same OCR Scan Receipt already uses — just a
 * prompt tuned for a payment screenshot instead of a shop receipt — and the
 * result is turned into the same sentence a typed share would have been.
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
    const image = shareIntent.files?.find((f) => f.mimeType.startsWith('image/'));
    // Claimed immediately so a re-render (or the next share) never re-files
    // the same share twice.
    resetShareIntent();
    // An image takes priority: GPay's share sometimes tags on caption text
    // ("Shared via Google Pay") alongside the payment card itself, which
    // would be the wrong thing to file literally.
    if (image) void handleImage(image);
    else if (text) void handle(text);
  }, [hasShareIntent, shareIntent.text, shareIntent.files, resetShareIntent]);
}

async function handleImage(file: ShareIntentFile) {
  try {
    const base64 = await new File(file.path).base64();
    const scanned = await scanPaymentWithAI(base64, file.mimeType);
    if (!(scanned.amount > 0)) {
      showDialog({
        title: 'Could not read that payment',
        message: "The shared image didn't show a clear amount — add it by hand instead.",
      });
      return;
    }
    const payee = scanned.payee ? ` to ${scanned.payee}` : '';
    await handle(`Paid ₹${scanned.amount}${payee}`);
  } catch (err) {
    showDialog({ title: 'Could not read that payment', message: describeError(err) });
    logFail('Could not read a shared payment image', describeError(err));
  }
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
