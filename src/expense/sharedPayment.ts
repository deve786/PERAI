import { listAccounts } from './accountsDb';
import { todayStr } from './dates';
import { findOrCreateCategory, listCategories, listExpenses, saveExpense } from './db';
import { categoryFromHistory, knownCategoryName, pickBankAccount, settleDate } from './sharedPaymentMatch';
import { mapToExpenseCategory } from './voiceExpense';
import type { ScannedPayment } from './ai/ocr';

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
  const date = settleDate(payment.date, todayStr());
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
