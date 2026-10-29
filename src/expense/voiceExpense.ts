import { deleteExpense, findOrCreateCategory, saveExpense } from './db';
import { mapToExpenseCategory } from './categoryMapping';
export { mapToExpenseCategory };

export interface VoiceExpenseInput {
  title: string;
  category?: string;
  eventDate: string;
  amount: number;
  rawInput?: string;
}

/**
 * Creates an entry in the Expense Tracker database corresponding to a voice or typed purchase note.
 * Returns the created expense ID.
 */
export async function recordVoiceExpense(input: VoiceExpenseInput): Promise<string> {
  const targetCategoryName = mapToExpenseCategory(input.title, input.category);
  const categoryId = await findOrCreateCategory(targetCategoryName);

  // Extract YYYY-MM-DD from ISO eventDate or fallback to today
  let dateStr = input.eventDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    dateStr = new Date().toISOString().slice(0, 10);
  }

  const id = await saveExpense({
    amount: input.amount,
    category_id: categoryId,
    date: dateStr,
    note: input.title,
    notes: input.rawInput ? `Voice capture: ${input.rawInput}` : '',
    method: 'UPI', // Default to UPI for digital voice capture in India / modern mobile
  });

  return id;
}

/**
 * Deletes an expense created via voice if the user triggers Undo.
 */
export async function removeVoiceExpense(expenseId: string): Promise<void> {
  if (!expenseId) return;
  await deleteExpense(expenseId);
}
