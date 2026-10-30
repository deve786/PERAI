import { getDb } from './db';
import { listAccounts } from './accountsDb';
import type { PassbookEntry } from './passbookLogic';
import { listTransfers } from './transfersDb';
import { transferEntries } from './transferLogic';

export async function listPassbookEntries(accountId?: string | null): Promise<PassbookEntry[]> {
  const db = await getDb();
  const accounts = await listAccounts().catch(() => []);
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  const expenseParams: unknown[] = [];
  let expenseSql = `
    SELECT
      e.id,
      e.amount,
      e.refund_amount,
      e.reimburse_amount,
      e.category_id,
      e.date,
      e.note,
      e.notes,
      e.method,
      e.user_tag,
      e.place,
      e.account_id,
      e.updated_at,
      COALESCE(c.name, 'Expense') AS cat_name,
      COALESCE(c.icon, 'receipt-outline') AS cat_icon,
      COALESCE(c.color, '#C8553D') AS cat_color
    FROM expenses e
    LEFT JOIN categories c ON c.id = e.category_id
    WHERE e.deleted = 0
  `;

  if (accountId) {
    expenseSql += ' AND e.account_id = ?';
    expenseParams.push(accountId);
  }

  const incomeParams: unknown[] = [];
  let incomeSql = `
    SELECT
      i.id,
      i.amount,
      i.category_id,
      i.date,
      i.note,
      i.notes,
      i.method,
      i.user_tag,
      i.place,
      i.account_id,
      i.updated_at,
      COALESCE(c.name, 'Income') AS cat_name,
      COALESCE(c.icon, 'wallet-outline') AS cat_icon,
      COALESCE(c.color, '#2E9465') AS cat_color
    FROM income i
    LEFT JOIN categories c ON c.id = i.category_id
    WHERE i.deleted = 0
  `;

  if (accountId) {
    incomeSql += ' AND i.account_id = ?';
    incomeParams.push(accountId);
  }

  const [expenses, incomes] = await Promise.all([
    db.getAllAsync<any>(expenseSql, ...(expenseParams as any[])),
    db.getAllAsync<any>(incomeSql, ...(incomeParams as any[])),
  ]);

  const entries: PassbookEntry[] = [];

  for (const e of expenses) {
    const acc = e.account_id ? accountMap.get(e.account_id) : undefined;
    const accountName = acc?.name || (e.method ? e.method : 'Cash');
    const netAmount = Math.max(0, e.amount - (e.refund_amount ?? 0) - (e.reimburse_amount ?? 0));
    const subParts = [e.cat_name, e.place, e.user_tag ? `@${e.user_tag}` : null].filter(Boolean);

    entries.push({
      id: `exp-${e.id}`,
      date: e.date,
      type: 'out',
      amount: e.amount,
      netAmount,
      refundAmount: e.refund_amount ?? null,
      reimburseAmount: e.reimburse_amount ?? null,
      title: e.note || e.cat_name || 'Expense',
      subtitle: subParts.join(' · '),
      category: e.cat_name,
      categoryIcon: e.cat_icon,
      categoryColor: e.cat_color,
      method: e.method || 'UPI',
      accountId: e.account_id ?? null,
      accountName,
      accountInstitution: acc?.institution,
      userTag: e.user_tag || undefined,
      place: e.place || undefined,
      updatedAt: e.updated_at || undefined,
    });
  }

  for (const i of incomes) {
    const acc = i.account_id ? accountMap.get(i.account_id) : undefined;
    const accountName = acc?.name || (i.method ? i.method : 'Cash');
    const subParts = [i.cat_name, i.user_tag ? `@${i.user_tag}` : null].filter(Boolean);

    entries.push({
      id: `inc-${i.id}`,
      date: i.date,
      type: 'in',
      amount: i.amount,
      netAmount: i.amount,
      title: i.note || i.cat_name || 'Income',
      subtitle: subParts.join(' · '),
      category: i.cat_name,
      categoryIcon: i.cat_icon,
      categoryColor: i.cat_color,
      method: i.method || 'UPI',
      accountId: i.account_id ?? null,
      accountName,
      accountInstitution: acc?.institution,
      userTag: i.user_tag || undefined,
      place: i.place || undefined,
      updatedAt: i.updated_at || undefined,
    });
  }

  // Cash taken out at an ATM: money moved between your own accounts.
  const transfers = await listTransfers().catch(() => []);
  entries.push(
    ...transferEntries(
      transfers,
      (id) => {
        const a = accountMap.get(id);
        return { name: a?.name ?? 'Account', institution: a?.institution };
      },
      accountId
    )
  );

  // Sort descending by date, with latest updated_at first within the same day
  entries.sort((a, b) => {
    const d = b.date.localeCompare(a.date);
    if (d !== 0) return d;
    const u = (b.updatedAt || '').localeCompare(a.updatedAt || '');
    if (u !== 0) return u;
    return b.id.localeCompare(a.id);
  });

  return entries;
}
