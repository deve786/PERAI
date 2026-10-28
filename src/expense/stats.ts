import type { ExpenseRow } from './db';
import { addDays, daysBetween, fromStr } from './dates';

export type CatTotal = { name: string; color: string; icon: string; total: number; count: number };
export type DayTotal = { label: string; date: string; total: number };

/** An expense's amount after subtracting whatever's been refunded or paid back by someone. Rows with no such field (income, recurring) pass through unchanged. */
export const net = (r: { amount: number; refund_amount?: number | null; reimburse_amount?: number | null }) =>
  Math.max(0, r.amount - (r.refund_amount ?? 0) - (r.reimburse_amount ?? 0));

export const sum = (rows: { amount: number; refund_amount?: number | null; reimburse_amount?: number | null }[]) => rows.reduce((a, r) => a + net(r), 0);

export function byCategory(rows: ExpenseRow[]): CatTotal[] {
  const map = new Map<string, CatTotal>();
  for (const r of rows) {
    const cur = map.get(r.cat_name) ?? { name: r.cat_name, color: r.cat_color, icon: r.cat_icon, total: 0, count: 0 };
    cur.total += net(r);
    cur.count += 1;
    map.set(r.cat_name, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

/** Daily totals for short ranges (<= 45 days), weekly buckets for longer ones, monthly for very long. */
export function trend(rows: { date: string; amount: number; refund_amount?: number | null; reimburse_amount?: number | null }[], from: string, to: string): DayTotal[] {
  const span = daysBetween(from, to);
  const out: DayTotal[] = [];
  if (span <= 45) {
    const map = new Map<string, number>();
    rows.forEach((r) => map.set(r.date, (map.get(r.date) ?? 0) + net(r)));
    for (let i = 0; i < span; i++) {
      const d = addDays(from, i);
      out.push({ date: d, label: String(fromStr(d).getDate()), total: map.get(d) ?? 0 });
    }
  } else if (span <= 190) {
    const buckets = Math.ceil(span / 7);
    for (let i = 0; i < buckets; i++) {
      const start = addDays(from, i * 7);
      const end = addDays(start, 6) > to ? to : addDays(start, 6);
      const total = rows.filter((r) => r.date >= start && r.date <= end).reduce((a, r) => a + net(r), 0);
      out.push({ date: start, label: `W${i + 1}`, total });
    }
  } else {
    const map = new Map<string, number>();
    rows.forEach((r) => {
      const k = r.date.slice(0, 7);
      map.set(k, (map.get(k) ?? 0) + net(r));
    });
    [...map.keys()].sort().forEach((k) => out.push({ date: k + '-01', label: k.slice(5), total: map.get(k)! }));
  }
  return out;
}

export function previousRange(from: string, to: string) {
  const span = daysBetween(from, to);
  return { from: addDays(from, -span), to: addDays(from, -1) };
}

export function fmtMoney(n: number, symbol = '₹') {
  const neg = n < 0;
  const v = Math.abs(n);
  const s = v.toLocaleString('en-IN', { maximumFractionDigits: v % 1 === 0 ? 0 : 2, minimumFractionDigits: v % 1 === 0 ? 0 : 2 });
  return `${neg ? '-' : ''}${symbol}${s}`;
}
