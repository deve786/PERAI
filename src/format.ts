import { CURRENCY_SYMBOLS } from './constants';
import type { Memory } from './types';

export function formatAmount(
  amount: number | null,
  currency: string | null
): string | null {
  if (amount === null) return null;
  const code = currency ?? '';
  const symbol = CURRENCY_SYMBOLS[code] ?? (code ? `${code} ` : '');
  const value = Number.isInteger(amount)
    ? amount.toLocaleString('en-IN')
    : amount.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
  return `${symbol}${value}`;
}

/** Local YYYY-MM-DD, used to group timeline sections by calendar day. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function dayLabel(iso: string, now: Date = new Date()): string {
  const key = dayKey(iso);
  if (key === dayKey(now.toISOString())) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === dayKey(yesterday.toISOString())) return 'Yesterday';

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (key === dayKey(tomorrow.toISOString())) return 'Tomorrow';

  const date = new Date(iso);
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  });
}

export function fullDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export interface DaySection {
  title: string;
  key: string;
  data: Memory[];
  /** Scheduled ahead of today — appointments and reminders. */
  isFuture: boolean;
  /** True on the first future section only, so it can carry one heading. */
  startsFuture: boolean;
}

/**
 * Group an already-sorted (newest first) list into SectionList sections.
 *
 * Sorting newest-first puts scheduled things above today, which reads as a
 * mistake unless the split is stated, so future days are flagged and the first
 * of them is marked to carry an "upcoming" heading.
 */
export function groupByDay(memories: Memory[], now: Date = new Date()): DaySection[] {
  const sections: DaySection[] = [];
  const todayKey = dayKey(now.toISOString());
  let current: DaySection | null = null;

  for (const memory of memories) {
    const key = dayKey(memory.eventDate);
    if (!current || current.key !== key) {
      current = {
        key,
        title: dayLabel(memory.eventDate, now),
        data: [],
        isFuture: key > todayKey,
        startsFuture: false,
      };
      sections.push(current);
    }
    current.data.push(memory);
  }

  const firstFuture = sections.findIndex((section) => section.isFuture);
  if (firstFuture !== -1) sections[firstFuture].startsFuture = true;

  return sections;
}
