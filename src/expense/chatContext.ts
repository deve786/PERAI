import { listAccounts } from './accountsDb';
import { listExpenses, type ExpenseRow } from './db';
import { addDays, monthRange, todayStr } from './dates';
import { byCategory, sum } from './stats';

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Builds a compact, pre-computed snapshot of the user's spending.
 * All sums are calculated here so the model never has to do arithmetic.
 */
export async function buildChatContext(currency: string, budget: number) {
  const [all, accounts] = await Promise.all([listExpenses(), listAccounts()]);
  const bankName = new Map(accounts.map((a) => [a.id, a.name]));
  const today = todayStr();
  const now = new Date();

  const months: {
    month: string;
    total: number;
    count: number;
    byCategory: Record<string, number>;
  }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const { from, to } = monthRange(d.getFullYear(), d.getMonth());
    const rows = all.filter((r) => r.date >= from && r.date <= to);
    if (rows.length === 0) continue;
    months.push({
      month: from.slice(0, 7),
      total: r2(sum(rows)),
      count: rows.length,
      byCategory: Object.fromEntries(byCategory(rows).map((c) => [c.name, r2(c.total)])),
    });
  }

  const window = (days: number) => {
    const from = addDays(today, -(days - 1));
    return all.filter((r) => r.date >= from && r.date <= today);
  };

  // Every field worth asking about — not just the handful the model used to
  // see — so "any refunded?" or "for whom" or "which bank" can be answered
  // straight from this snapshot instead of coming back empty.
  const line = (r: ExpenseRow) => ({
    date: r.date,
    amount: r.amount,
    category: r.cat_name,
    subCategory: r.sub_category || null,
    note: r.note || null,
    details: r.notes || null,
    method: r.method,
    bank: r.account_id ? bankName.get(r.account_id) ?? null : null,
    forUser: r.user_tag || null,
    peopleCount: r.people_count ?? null,
    itemCount: r.item_count > 1 ? r.item_count : null,
    refunded: r.cancelled === 1,
    refundAmount: r.refund_amount ?? null,
    refundPeopleCount: r.refund_people_count ?? null,
    refundBank: r.refund_account_id ? bankName.get(r.refund_account_id) ?? null : null,
    netAmount: r2(r.amount - (r.refund_amount ?? 0)),
  });

  return {
    today,
    currency,
    monthlyBudget: budget || null,
    allTime: {
      total: r2(sum(all)),
      count: all.length,
      firstExpenseDate: all.length ? all[all.length - 1].date : null,
    },
    last7Days: { total: r2(sum(window(7))), count: window(7).length },
    last30Days: {
      total: r2(sum(window(30))),
      count: window(30).length,
      byCategory: Object.fromEntries(byCategory(window(30)).map((c) => [c.name, r2(c.total)])),
    },
    monthlySummaries: months,
    // Most recent individual expenses (older ones are only visible via monthlySummaries).
    recentExpenses: all.slice(0, 150).map(line),
    recentExpensesNote:
      all.length > 150 ? `Only the latest 150 of ${all.length} expenses are listed individually.` : 'All expenses are listed.',
  };
}
