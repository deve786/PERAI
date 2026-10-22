import { monthName, monthRange } from './dates';

/** What the expense page is showing: every entry ever, or one month as 'YYYY-MM'. */
export type Period = 'overall' | string;
export const OVERALL: Period = 'overall';

/** The months to offer in the dropdown: every month with an entry, plus the current one, newest first. */
export function monthsWithData(dates: string[], currentYm: string): string[] {
  const months = new Set(dates.map((d) => d.slice(0, 7)).filter((ym) => /^\d{4}-\d{2}$/.test(ym)));
  months.add(currentYm);
  return [...months].sort((a, b) => b.localeCompare(a));
}

/** The first and last day of a period, or null for Overall (no limit). */
export function periodRange(period: Period): { from: string; to: string } | null {
  if (period === OVERALL) return null;
  const [y, m] = period.split('-').map(Number);
  return monthRange(y, m - 1);
}

/** "Oct 2026", or "Overall". */
export function periodLabel(period: Period): string {
  if (period === OVERALL) return 'Overall';
  const [y, m] = period.split('-').map(Number);
  return `${monthName(m - 1)} ${y}`;
}

/** The month before 'YYYY-MM'. */
export function previousMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
