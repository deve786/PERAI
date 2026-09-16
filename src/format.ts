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

/**
 * Did the person actually say a clock time?
 *
 * The model always returns a full timestamp, so a note like "bought a car two
 * days back" arrives with a time attached that nobody stated — often the minute
 * it was typed. Showing that time would claim the car was bought at 20:52.
 * Only an explicit clock time in the original wording counts. Uses the stored
 * `dateExpression`, so it also corrects entries saved before this existed.
 */
export function hasStatedTime(dateExpression: string | null): boolean {
  if (!dateExpression) return false;
  return /\b\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)|\b\d{1,2}:\d{2}\b|o'?clock|\bnoon\b|\bmidnight\b/i.test(
    dateExpression
  );
}

/**
 * "ADDED 16 SEP" when an entry was recorded on a different day from when it
 * happened; null when they are the same day and the label would only repeat
 * the section heading.
 */
export function addedLabel(
  memory: Pick<Memory, 'eventDate' | 'createdAt'>
): string | null {
  if (dayKey(memory.createdAt) === dayKey(memory.eventDate)) return null;
  return `ADDED ${shortDate(memory.createdAt).toUpperCase()}`;
}

/**
 * The current moment as local wall-clock time with its UTC offset, e.g.
 * "2026-09-16T01:10:00+05:30".
 *
 * Sent to the model instead of a UTC ISO string. In India between midnight and
 * 05:30 the UTC date is still yesterday, so "yesterday" resolved against a UTC
 * timestamp lands two days back.
 */
export function localTimestamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(offset / 60)}:${pad(offset % 60)}`
  );
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
