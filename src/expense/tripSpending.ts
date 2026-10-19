/**
 * Tying spending to the entry it belongs to — a trip, a weekend, a course.
 *
 * Pure, so the awkward parts are unit tested in plain Node: which day counts
 * as inside a span, what is already linked, and never adding two currencies
 * together. The database half lives in src/expense/db.ts.
 */

/** Just enough of an expense row to decide and to total. */
export interface LinkableExpense {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  cat_name: string;
  cat_color?: string;
  /** Absent means the app's own currency, which is the usual case. */
  currency?: string;
  /** Whatever's been refunded from this expense (e.g. a cancelled Ticket) — counted out of the total, not still spent. */
  refund_amount?: number | null;
}

export interface DateSpan {
  /** YYYY-MM-DD, the day it started. */
  from: string;
  /** YYYY-MM-DD, the last day. */
  to: string;
}

/**
 * Is this a span that can hold spending?
 *
 * A single day is fine — a day trip is still a trip. Ending before it starts
 * is not, and is refused rather than quietly swapped, because the person
 * meant something by the dates they picked.
 */
export function isValidSpan(from: string, to: string): boolean {
  if (!from || !to) return false;
  return to >= from;
}

/** The date part of an ISO timestamp, which is what expenses are keyed by. */
export function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * The expenses worth offering for a span: inside it, not already linked.
 *
 * Both ends count. Someone who says a trip ran from the 3rd to the 6th means
 * the 3rd and the 6th as well, and lunch at the airport on the last day is
 * part of it.
 *
 * Income never appears: the caller passes expenses only, since income lives
 * in its own table and is not spending.
 */
export function suggestExpenses(
  expenses: LinkableExpense[],
  span: DateSpan,
  alreadyLinked: Set<string> = new Set()
): LinkableExpense[] {
  if (!isValidSpan(span.from, span.to)) return [];
  return expenses
    .filter((expense) => expense.date >= span.from && expense.date <= span.to)
    .filter((expense) => !alreadyLinked.has(expense.id))
    .sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
}

export interface CurrencyTotal {
  currency: string;
  total: number;
  count: number;
}

/**
 * What a set of expenses comes to, kept apart by currency.
 *
 * Two currencies are never added together: ₹4,000 plus $40 is not 4,040 of
 * anything. They are reported side by side instead, largest first.
 *
 * @param defaultCurrency what a row with no currency of its own is in
 */
/** An expense's amount after subtracting whatever's been refunded from it. */
const net = (expense: LinkableExpense) => expense.amount - (expense.refund_amount ?? 0);

export function totalsByCurrency(
  expenses: LinkableExpense[],
  defaultCurrency: string
): CurrencyTotal[] {
  const totals = new Map<string, CurrencyTotal>();
  for (const expense of expenses) {
    const currency = expense.currency || defaultCurrency;
    const entry = totals.get(currency) ?? { currency, total: 0, count: 0 };
    entry.total += net(expense);
    entry.count += 1;
    totals.set(currency, entry);
  }
  return [...totals.values()].sort((a, b) => b.total - a.total);
}

export interface CategorySlice {
  name: string;
  color?: string;
  total: number;
  count: number;
}

/** Where the money went, biggest first. One currency at a time. */
export function categoryBreakdown(expenses: LinkableExpense[]): CategorySlice[] {
  const slices = new Map<string, CategorySlice>();
  for (const expense of expenses) {
    const slice = slices.get(expense.cat_name) ?? {
      name: expense.cat_name,
      color: expense.cat_color,
      total: 0,
      count: 0,
    };
    slice.total += net(expense);
    slice.count += 1;
    slices.set(expense.cat_name, slice);
  }
  return [...slices.values()].sort((a, b) => b.total - a.total);
}

/**
 * The id a link is stored under: derived from the pair, so linking the same
 * expense to the same entry twice is the same row, on this device or any
 * other, rather than a duplicate that sync would have to reconcile.
 */
export function linkId(memoryId: string, expenseId: string): string {
  return `${memoryId}:${expenseId}`;
}
