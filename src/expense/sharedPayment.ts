import { insertMemory } from '../db/queries';
import type { Category, Memory, MemoryDraft } from '../types';
import { listAccounts } from './accountsDb';
import { todayStr } from './dates';
import { findOrCreateCategory, saveExpense } from './db';
import { mapToExpenseCategory } from './voiceExpense';
import type { ScannedPayment } from './ai/ocr';

/** PERAI's own, much coarser category set has no "Food" or "Bills" — the closest fit stands in. */
const PERAI_CATEGORY: Record<string, Category> = {
  Food: 'Other',
  Transport: 'Travel',
  Shopping: 'Shopping',
  Bills: 'Other',
  Rent: 'Other',
  Health: 'Health',
  Entertainment: 'Entertainment',
  Other: 'Other',
};

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

/** The ISO timestamp a scanned payment's own date becomes — noon on that day when a date was read, right now otherwise. */
function eventDateOf(payment: ScannedPayment): string {
  if (payment.date && /^\d{4}-\d{2}-\d{2}$/.test(payment.date)) {
    return new Date(`${payment.date}T12:00:00.000Z`).toISOString();
  }
  return new Date().toISOString();
}

/**
 * Turns a payment read off a shared GPay screenshot (or text) into an
 * Expense.
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

/**
 * Files the same payment into the PERAI record too, as an already-done
 * purchase — struck through from the moment it lands, since the money is
 * already spent rather than something still to do.
 */
export async function recordSharedPaymentMemory(payment: ScannedPayment): Promise<Memory> {
  const title = payment.payee ?? 'Payment';
  const eventDate = eventDateOf(payment);
  const draft: MemoryDraft = {
    title,
    type: 'purchase',
    category: PERAI_CATEGORY[mapToExpenseCategory(title)] ?? 'Other',
    eventDate,
    dateExpression: null,
    amount: payment.amount,
    currency: null,
    people: null,
    location: null,
    tags: null,
    priority: null,
    status: 'done',
    repeat: null,
    groupName: null,
  };
  return insertMemory(draft, `Shared from GPay: ${title}, ₹${payment.amount}`);
}
