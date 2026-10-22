import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { listExpenseItems, listExpenses } from './db';

const esc = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function exportCsv() {
  const rows = await listExpenses();
  const lines = ['Date,Amount,Category,Payment method,For User,Place,Title,Notes,Items,Recurring'];
  for (const r of rows) {
    const items = r.item_count > 0 ? await listExpenseItems(r.id) : [];
    const itemSummary = items.map((it) => `${it.name || 'Item'}: ${it.amount}`).join('; ');
    lines.push([r.date, r.amount, r.cat_name, r.method, r.user_tag ?? '', r.place ?? '', r.note, r.notes, itemSummary, r.recurring_id ? 'yes' : 'no'].map(esc).join(','));
  }
  const file = new File(Paths.cache, `spendly-expenses-${new Date().toISOString().slice(0, 10)}.csv`);
  file.create({ overwrite: true });
  file.write(lines.join('\n'));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export expenses' });
  }
  return rows.length;
}
