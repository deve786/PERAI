import { listAccounts } from './accountsDb';
import { todayStr } from './dates';
import { findOrCreateCategory, saveExpense } from './db';
import { mapToExpenseCategory } from './voiceExpense';
import type { ScannedPayment } from './ai/ocr';

/** The bank account a scanned "paid using X Bank" line most likely refers to — a loose, forgiving match either way, since OCR wording rarely matches an account's saved name exactly. */
async function matchBankAccount(bankLine: string | null): Promise<string | null> {
  if (!bankLine) return null;
  const needle = bankLine.trim().toLowerCase();
  if (!needle) return null;

  const accounts = await listAccounts({ type: 'bank' });
  const match = accounts.find((a) => {
    const name = a.name.trim().toLowerCase();
    const institution = a.institution.trim().toLowerCase();
    return (name && (needle.includes(name) || name.includes(needle)))
      || (institution && (needle.includes(institution) || institution.includes(needle)));
  });
  return match?.id ?? null;
}

/**
 * Turns a payment read off a shared GPay screenshot (or text) straight into
 * an Expense — no PERAI Record entry alongside it, since a shared payment is
 * spending to track, not a note to remember.
 */
export async function recordSharedPayment(payment: ScannedPayment): Promise<string> {
  const title = payment.payee ?? 'Payment';
  const categoryId = await findOrCreateCategory(mapToExpenseCategory(title));
  const accountId = await matchBankAccount(payment.bank);
  const date = payment.date && /^\d{4}-\d{2}-\d{2}$/.test(payment.date) ? payment.date : todayStr();

  return saveExpense({
    amount: payment.amount,
    category_id: categoryId,
    date,
    note: title,
    notes: `Shared from GPay: ${title}`,
    method: 'UPI',
    account_id: accountId,
  });
}
