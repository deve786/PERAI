import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { listExpenseItems, listExpenses, listIncome } from './db';
import { net } from './stats';

const esc = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function exportCsv() {
  const [expenses, incomes] = await Promise.all([listExpenses(), listIncome()]);
  const lines = ['Date,Type,Amount,Refund,Payback,Net Amount,Category,Payment method,For User,Place,Title,Notes,Items,Recurring'];

  type ExportRow = {
    date: string;
    type: 'Expense' | 'Income';
    amount: number;
    refund: string | number;
    payback: string | number;
    netAmount: number;
    category: string;
    method: string;
    userTag: string;
    place: string;
    title: string;
    notes: string;
    items: string;
    recurring: string;
  };

  const records: ExportRow[] = [];

  for (const r of expenses) {
    const items = r.item_count > 0 ? await listExpenseItems(r.id) : [];
    const itemSummary = items.map((it) => `${it.name || 'Item'}: ${it.amount}`).join('; ');
    records.push({
      date: r.date,
      type: 'Expense',
      amount: r.amount,
      refund: r.refund_amount ?? '',
      payback: r.reimburse_amount ?? '',
      netAmount: net(r),
      category: r.cat_name,
      method: r.method,
      userTag: r.user_tag ?? '',
      place: r.place ?? '',
      title: r.note,
      notes: r.notes,
      items: itemSummary,
      recurring: r.recurring_id ? 'yes' : 'no',
    });
  }

  for (const r of incomes) {
    records.push({
      date: r.date,
      type: 'Income',
      amount: r.amount,
      refund: '',
      payback: '',
      netAmount: r.amount,
      category: r.cat_name,
      method: r.method,
      userTag: r.user_tag ?? '',
      place: r.place ?? '',
      title: r.note,
      notes: r.notes,
      items: '',
      recurring: 'no',
    });
  }

  records.sort((a, b) => b.date.localeCompare(a.date));

  for (const r of records) {
    lines.push([
      r.date,
      r.type,
      r.amount,
      r.refund,
      r.payback,
      r.netAmount,
      r.category,
      r.method,
      r.userTag,
      r.place,
      r.title,
      r.notes,
      r.items,
      r.recurring,
    ].map(esc).join(','));
  }

  const file = new File(Paths.cache, `perai-financial-records-${new Date().toISOString().slice(0, 10)}.csv`);
  file.create({ overwrite: true });
  file.write(lines.join('\n'));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export financial records' });
  }
  return records.length;
}

