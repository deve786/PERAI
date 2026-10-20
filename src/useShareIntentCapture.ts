import { useEffect } from 'react';
import { File } from 'expo-file-system';
import { useShareIntentContext, type ShareIntentFile } from 'expo-share-intent';
import { describeError } from './ai/client';
import { showDialog } from './dialogStore';
import { extractPaymentFromText, scanPaymentWithAI, type ScannedPayment } from './expense/ai/ocr';
import { listCategories } from './expense/db';
import { recordSharedPayment } from './expense/sharedPayment';
import { logFail, logOk } from './log';
import { setShareProcessing, showSharedExpense } from './shareProcessingStore';

/** However long reading a payment screenshot genuinely takes, it should never look stuck past this. */
const READ_TIMEOUT_MS = 25000;

/**
 * Turns a payment shared into PERAI from another app — GPay's "Share" on a
 * payment, chiefly — into an Expense. Expense only: a shared payment is
 * spending to track, not a note for the Record.
 *
 * GPay's own Share button sends an image of the payment card, not text, so
 * that's read with the same OCR the receipt scanner uses — just a prompt
 * tuned for a payment screenshot's amount/payee/bank instead of a shop
 * receipt's line items. Shared text (from some other app) goes through the
 * same extraction, run on words instead of a picture.
 *
 * The read itself (an AI call) has no UI of its own otherwise — nothing but
 * whatever screen the app happened to open to would show while it ran, easy
 * to mistake for the app being stuck. setShareProcessing() puts up a small
 * "reading it" card for exactly that stretch, via ShareProcessingOverlay.
 *
 * Lives at the root rather than on one screen, since a share can arrive
 * while you're anywhere in the app.
 */
export function useShareIntentCapture() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  useEffect(() => {
    if (!hasShareIntent) return;
    const text = shareIntent.text?.trim();
    const image = shareIntent.files?.find((f) => f.mimeType.startsWith('image/'));
    // Claimed immediately so a re-render (or the next share) never files the
    // same share twice.
    resetShareIntent();
    if (!image && !text) return;

    setShareProcessing(true, 'Reading the shared payment…');
    // An image takes priority: GPay's share sometimes tags on caption text
    // ("Shared via Google Pay") alongside the payment card itself, which
    // would be the wrong thing to read literally.
    const work = image ? handleImage(image) : handleText(text as string);
    work.then(finish).catch(fail);
  }, [hasShareIntent, shareIntent.text, shareIntent.files, resetShareIntent]);
}

/** Rejects with `message` if `promise` hasn't settled within `ms` — a hung network call should never look like a frozen app. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** The person's own expense categories, offered to the AI to choose from. */
async function categoryNames(): Promise<string[]> {
  return (await listCategories()).map((c) => c.name);
}

async function handleImage(file: ShareIntentFile): Promise<ScannedPayment> {
  return withTimeout(
    (async () => {
      const [base64, names] = await Promise.all([new File(file.path).base64(), categoryNames()]);
      return scanPaymentWithAI(base64, file.mimeType, names);
    })(),
    READ_TIMEOUT_MS,
    'Reading the payment image took too long. Check your connection and try sharing it again.'
  );
}

async function handleText(text: string): Promise<ScannedPayment> {
  return withTimeout(
    categoryNames().then((names) => extractPaymentFromText(text, names)),
    READ_TIMEOUT_MS,
    'Reading the shared text took too long. Check your connection and try sharing it again.'
  );
}

// A Modal's dismissal is a native animation, not an instant state flip —
// this gives Android a beat to actually close the loading card's window
// before the next screen (or dialog) tries to open on top of it.
const settle = () => new Promise((resolve) => setTimeout(resolve, 80));

async function finish(scanned: ScannedPayment) {
  if (!(scanned.amount > 0)) {
    setShareProcessing(false);
    await settle();
    showDialog({
      title: 'Could not read that payment',
      message: "The share didn't have a clear amount in it — add it by hand instead.",
    });
    return;
  }
  const added = await recordSharedPayment(scanned);
  logOk('Added an expense from a share', `${added.title} · ${added.amount}`);
  // The loading card turns into the added expense in place — no screen
  // switch while the share hand-off is still settling.
  showSharedExpense(added);
}

function fail(err: unknown) {
  setShareProcessing(false);
  void settle().then(() => {
    showDialog({ title: 'Could not read that payment', message: describeError(err) });
  });
  logFail('Could not file a shared payment', describeError(err));
}
