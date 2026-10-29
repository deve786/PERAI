import type { AskResult } from '../ai/ask';
import { logFail } from '../log';
import type { Memory } from '../types';
import { getSetting, listLinkedExpenses } from './db';
import { fmtMoney } from './stats';
import { categoryBreakdown, totalsByCurrency, type LinkableExpense } from './tripSpending';

/**
 * Answer "how much did I spend on my Kozhikode trip" from the link table.
 *
 * No model call: the entry is named, the links are stored, and the rest is a
 * SUM. Returns null when the entry has nothing linked yet, so the question
 * falls through to the ordinary flow rather than answering "zero" — nothing
 * linked means nobody has said what belongs to it, not that it was free.
 */
export async function answerTripSpend(memory: Memory): Promise<AskResult | null> {
  try {
    const [rows, symbol] = await Promise.all([
      listLinkedExpenses(memory.id),
      getSetting('symbol', '₹'),
    ]);
    if (rows.length === 0) return null;

    const linkable: LinkableExpense[] = rows.map((row) => ({
      id: row.id,
      date: row.date,
      amount: row.amount,
      cat_name: row.cat_name,
      cat_color: row.cat_color,
      refund_amount: row.refund_amount,
      reimburse_amount: row.reimburse_amount,
    }));

    const totals = totalsByCurrency(linkable, symbol || '₹');
    const breakdown = categoryBreakdown(linkable);
    // Currencies are reported side by side; they are never added together.
    const headline = totals.map((t) => fmtMoney(t.total, t.currency)).join(' · ');

    return {
      answer: `${memory.title} cost ${headline} across ${rows.length} ${
        rows.length === 1 ? 'expense' : 'expenses'
      }.`,
      headline,
      items: breakdown.map(
        (slice) =>
          `${slice.name} · ${fmtMoney(slice.total, symbol || '₹')} · ${slice.count} ${
            slice.count === 1 ? 'expense' : 'expenses'
          }`
      ),
      evidence: [memory],
      usedExpenseData: true,
      found: true,
    };
  } catch (err) {
    logFail('Could not total a trip', err instanceof Error ? err.message : String(err));
    return null;
  }
}
