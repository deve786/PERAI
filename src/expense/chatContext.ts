import { listAccounts } from './accountsDb';
import { listExpenses, listIncome, type ExpenseRow, type IncomeRow } from './db';
import { addDays, monthRange, todayStr } from './dates';
import { byCategory, net, sum } from './stats';

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
  //
  // `spent` comes first and is the net figure, because that is the one almost
  // every question means. When both were offered as `amount` and `netAmount`,
  // answers were added up from `amount` and counted money that had been
  // refunded or paid back — a ticket bought for someone else and settled in
  // full still showed as spending.
  const line = (r: ExpenseRow) => ({
    date: r.date,
    spent: r2(net(r)),
    billedAmount: r2(net(r)) === r2(r.amount) ? null : r.amount,
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

  // Totals per place, and per category within each place.
  //
  // "How much were the tickets in Minicoy" used to be answered by the model
  // picking the Minicoy rows out of the list and adding them up in its head. It
  // added up the wrong column, dropped rows, and gave a different total every
  // time it was asked. Every figure it needs is worked out here instead, net of
  // refunds and paybacks, so the answer is a lookup rather than a sum.
  const placeTotals = new Map<string, { total: number; count: number; byCategory: Map<string, number> }>();
  for (const row of all) {
    const place = (row.place || '').trim();
    if (!place) continue;
    const entry = placeTotals.get(place) ?? { total: 0, count: 0, byCategory: new Map<string, number>() };
    entry.total += net(row);
    entry.count += 1;
    entry.byCategory.set(row.cat_name, (entry.byCategory.get(row.cat_name) ?? 0) + net(row));
    placeTotals.set(place, entry);
  }

  const byPlace = [...placeTotals.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 40)
    .map(([place, entry]) => ({
      place,
      total: r2(entry.total),
      count: entry.count,
      byCategory: Object.fromEntries([...entry.byCategory].map(([name, value]) => [name, r2(value)])),
    }));

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
    // Net of refunds and paybacks, over every expense ever recorded, not just
    // the recent ones listed individually below.
    byPlace,
    // Most recent individual expenses (older ones are only visible via monthlySummaries).
    recentExpenses: all.slice(0, 150).map(line),
    recentExpensesNote:
      all.length > 150 ? `Only the latest 150 of ${all.length} expenses are listed individually.` : 'All expenses are listed.',
    recentIncome: allIncome.slice(0, 50).map(incomeLine),
    recentIncomeNote:
      allIncome.length > 50 ? `Only the latest 50 of ${allIncome.length} income entries are listed individually.` : 'All income entries are listed.',
  };
}

