import { listAccounts } from './accountsDb';
import { listExpenses, listIncome, type ExpenseRow, type IncomeRow } from './db';
import { addDays, monthRange, todayStr } from './dates';
import { byCategory, sum } from './stats';

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Builds a compact, pre-computed snapshot of the user's spending and income.
 * All sums are calculated here so the model never has to do arithmetic.
 */
export async function buildChatContext(currency: string, budget: number) {
  const [all, allIncome, accounts] = await Promise.all([listExpenses(), listIncome(), listAccounts()]);
  const bankName = new Map(accounts.map((a) => [a.id, a.name]));
  const today = todayStr();
  const now = new Date();

  const months: {
    month: string;
    total: number;
    count: number;
    incomeTotal: number;
    incomeCount: number;
    netSavings: number;
    byCategory: Record<string, number>;
  }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const { from, to } = monthRange(d.getFullYear(), d.getMonth());
    const rows = all.filter((r) => r.date >= from && r.date <= to);
    const incRows = allIncome.filter((r) => r.date >= from && r.date <= to);
    if (rows.length === 0 && incRows.length === 0) continue;
    const spent = r2(sum(rows));
    const earned = r2(incRows.reduce((acc, r) => acc + r.amount, 0));
    months.push({
      month: from.slice(0, 7),
      total: spent,
      count: rows.length,
      incomeTotal: earned,
      incomeCount: incRows.length,
      netSavings: r2(earned - spent),
      byCategory: Object.fromEntries(byCategory(rows).map((c) => [c.name, r2(c.total)])),
    });
  }

  const window = (days: number) => {
    const from = addDays(today, -(days - 1));
    return all.filter((r) => r.date >= from && r.date <= today);
  };
  const incomeWindow = (days: number) => {
    const from = addDays(today, -(days - 1));
    return allIncome.filter((r) => r.date >= from && r.date <= today);
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
    place: r.place || null,
    peopleCount: r.people_count ?? null,
    itemCount: r.item_count > 1 ? r.item_count : null,
    refunded: r.cancelled === 1,
    refundPending: r.cancelled === 1 && r.refund_amount == null,
    refundAmount: r.refund_amount ?? null,
    refundPeopleCount: r.refund_people_count ?? null,
    refundBank: r.refund_account_id ? bankName.get(r.refund_account_id) ?? null : null,
    reimbursed: r.reimbursed === 1,
    reimburseAmount: r.reimburse_amount ?? null,
    reimburseBank: r.reimburse_account_id ? bankName.get(r.reimburse_account_id) ?? null : null,
    netAmount: r2(Math.max(0, r.amount - (r.refund_amount ?? 0) - (r.reimburse_amount ?? 0))),
  });

  const incomeLine = (r: IncomeRow) => ({
    date: r.date,
    amount: r.amount,
    category: r.cat_name,
    note: r.note || null,
    details: r.notes || null,
    method: r.method,
    bank: r.account_id ? bankName.get(r.account_id) ?? null : null,
    forUser: r.user_tag || null,
    place: r.place || null,
  });

  const totalSpent = r2(sum(all));
  const totalIncome = r2(allIncome.reduce((acc, r) => acc + r.amount, 0));

  return {
    today,
    currency,
    monthlyBudget: budget || null,
    allTime: {
      total: totalSpent,
      count: all.length,
      incomeTotal: totalIncome,
      incomeCount: allIncome.length,
      netSavings: r2(totalIncome - totalSpent),
      firstExpenseDate: all.length ? all[all.length - 1].date : null,
    },
    last7Days: {
      total: r2(sum(window(7))),
      count: window(7).length,
      incomeTotal: r2(incomeWindow(7).reduce((acc, r) => acc + r.amount, 0)),
      incomeCount: incomeWindow(7).length,
    },
    last30Days: {
      total: r2(sum(window(30))),
      count: window(30).length,
      incomeTotal: r2(incomeWindow(30).reduce((acc, r) => acc + r.amount, 0)),
      incomeCount: incomeWindow(30).length,
      byCategory: Object.fromEntries(byCategory(window(30)).map((c) => [c.name, r2(c.total)])),
    },
    monthlySummaries: months,
    // Most recent individual expenses (older ones are only visible via monthlySummaries).
    recentExpenses: all.slice(0, 150).map(line),
    recentExpensesNote:
      all.length > 150 ? `Only the latest 150 of ${all.length} expenses are listed individually.` : 'All expenses are listed.',
    recentIncome: allIncome.slice(0, 50).map(incomeLine),
    recentIncomeNote:
      allIncome.length > 50 ? `Only the latest 50 of ${allIncome.length} income entries are listed individually.` : 'All income entries are listed.',
  };
}

