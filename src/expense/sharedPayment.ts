import { insertMemory } from '../db/queries';
import type { Category, Memory, MemoryDraft } from '../types';
import { listAccounts } from './accountsDb';
import { todayStr } from './dates';
import { findOrCreateCategory, listCategories, listExpenses, saveExpense } from './db';
import { categoryFromHistory, knownCategoryName, pickBankAccount } from './sharedPaymentMatch';
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

/** What was just added, for showing it back. */
export interface SharedExpense {
  id: string;
  title: string;
  amount: number;
  date: string; // YYYY-MM-DD
  category: string;
  /** The saved bank account it was linked to, if one matched. */
  bank: string | null;
  notes: string;
}

/** The ISO timestamp a scanned payment's own date becomes — noon on that day when a date was read, right now otherwise. */
function eventDateOf(payment: ScannedPayment): string {
  if (payment.date && /^\d{4}-\d{2}-\d{2}$/.test(payment.date)) {
    return new Date(`${payment.date}T12:00:00.000Z`).toISOString();
  }
  return new Date().toISOString();
}

/**
 * The category for a shared payment: whatever this payee was filed under last
 * time (the person's own choice); else the one the AI picked from their own
 * categories while reading the payment; else a keyword guess from the name.
 */
async function resolveCategory(
  payment: ScannedPayment,
  title: string,
  history: Awaited<ReturnType<typeof listExpenses>>
): Promise<{ id: string; name: string }> {
  const categories = await listCategories();
  const fromHistory = categoryFromHistory(payment.payee, history, new Set(categories.map((c) => c.id)));
  const previous = categories.find((c) => c.id === fromHistory);
  if (previous) return { id: previous.id, name: previous.name };

  const name =
    knownCategoryName(payment.category, categories.map((c) => c.name)) ?? mapToExpenseCategory(title);
  return { id: await findOrCreateCategory(name), name };
}

/**
 * Turns a payment read off a shared GPay screenshot (or text) into an
 * Expense, paid by UPI from the bank the card names — or, when it names
 * none we know, the only bank account, else the one last used for UPI.
 */
export async function recordSharedPayment(payment: ScannedPayment): Promise<SharedExpense> {
  const title = payment.payee ?? 'Payment';
  const [history, accounts] = await Promise.all([listExpenses(), listAccounts({ type: 'bank' })]);
  const category = await resolveCategory(payment, title, history);
  const accountId = pickBankAccount(payment.bank, accounts, history);
  const date = payment.date && /^\d{4}-\d{2}-\d{2}$/.test(payment.date) ? payment.date : todayStr();
  const notes = `Shared from GPay: ${title}`;

  const id = await saveExpense({
    amount: payment.amount,
    category_id: category.id,
    date,
    note: title,
    notes,
    method: 'UPI',
    account_id: accountId,
  });
  const bank = accounts.find((a) => a.id === accountId)?.name ?? null;
  return { id, title, amount: payment.amount, date, category: category.name, bank, notes };
}

/**
 * Files the same payment into the PERAI record too, as an already-done
 * purchase — struck through from the moment it lands, since the money is
 * already spent rather than something still to do.
 */
export async function recordSharedPaymentMemory(payment: ScannedPayment, categoryName: string): Promise<Memory> {
  const title = payment.payee ?? 'Payment';
  const eventDate = eventDateOf(payment);
  const draft: MemoryDraft = {
    title,
    type: 'purchase',
    category: PERAI_CATEGORY[categoryName] ?? 'Other',
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
