import { useEffect } from 'react';
import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useShareIntentContext, type ShareIntentFile } from 'expo-share-intent';
import { describeError } from './ai/client';
import { showDialog } from './dialogStore';
import { extractPaymentFromText, scanPaymentWithAI, type ScannedPayment } from './expense/ai/ocr';
import { recordSharedPayment } from './expense/sharedPayment';
import { logFail, logOk } from './log';

/**
 * Turns a payment shared into PERAI from another app — GPay's "Share" on a
 * payment, chiefly — straight into an Expense, the same way the Scan Receipt
 * button on the Expense form does for a photographed bill. No PERAI Record
 * entry is made alongside it: a shared payment is spending, not a note.
 *
 * GPay's own Share button sends an image of the payment card, not text, so
 * that's read with the same OCR the receipt scanner uses — just a prompt
 * tuned for a payment screenshot's amount/payee/bank instead of a shop
 * receipt's line items. Shared text (from some other app) goes through the
 * same extraction, run on words instead of a picture.
 *
 * Lives at the root rather than on one screen, since a share can arrive
 * while you're anywhere in the app.
 */
export function useShareIntentCapture() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const router = useRouter();

  useEffect(() => {
    if (!hasShareIntent) return;
    const text = shareIntent.text?.trim();
    const image = shareIntent.files?.find((f) => f.mimeType.startsWith('image/'));
    // Claimed immediately so a re-render (or the next share) never files the
    // same share twice.
    resetShareIntent();
    // An image takes priority: GPay's share sometimes tags on caption text
    // ("Shared via Google Pay") alongside the payment card itself, which
    // would be the wrong thing to read literally.
    if (image) void handleImage(image, router);
    else if (text) void handleText(text, router);
  }, [hasShareIntent, shareIntent.text, shareIntent.files, resetShareIntent, router]);
}

async function handleImage(file: ShareIntentFile, router: ReturnType<typeof useRouter>) {
  try {
    const base64 = await new File(file.path).base64();
    const scanned = await scanPaymentWithAI(base64, file.mimeType);
    await finish(scanned, router);
  } catch (err) {
    fail(err);
  }
}

async function handleText(text: string, router: ReturnType<typeof useRouter>) {
  try {
    const scanned = await extractPaymentFromText(text);
    await finish(scanned, router);
  } catch (err) {
    fail(err);
  }
}

async function finish(scanned: ScannedPayment, router: ReturnType<typeof useRouter>) {
  if (!(scanned.amount > 0)) {
    showDialog({
      title: 'Could not read that payment',
      message: "The share didn't have a clear amount in it — add it by hand instead.",
    });
    return;
  }
  const id = await recordSharedPayment(scanned);
  logOk('Added an expense from a share', `${scanned.payee ?? 'Payment'} · ${scanned.amount}`);
  router.push({ pathname: '/expense/expense', params: { id: String(id) } });
}

function fail(err: unknown) {
  showDialog({ title: 'Could not read that payment', message: describeError(err) });
  logFail('Could not file a shared payment', describeError(err));
}
