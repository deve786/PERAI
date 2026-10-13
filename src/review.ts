/**
 * The week, counted up — what was finished, what slipped, what it cost.
 *
 * Pure and offline: the figures come from the record itself, so the weekly
 * review costs nothing and works with no network. Unit tested in plain Node.
 */
import { dueAt } from './strike';
import type { Memory } from './types';

export interface WeekInReview {
  /** Midnight seven days back, and now. */
  from: Date;
  to: Date;
  /** Recorded during the week, whatever became of it. */
  recorded: Memory[];
  /** Ticked off during the week. */
  finished: Memory[];
  /** Still open, and its moment has gone. */
  slipped: Memory[];
  /** Still open and still ahead. */
  ahead: Memory[];
  /** Spent during the week, per currency. */
  spent: { currency: string; total: number }[];
}

const DAYS = 7;

export function weekInReview(memories: Memory[], now: Date = new Date()): WeekInReview {
  const from = new Date(now);
  from.setDate(from.getDate() - DAYS);
  from.setHours(0, 0, 0, 0);

  const within = (iso: string) => {
    const at = new Date(iso).getTime();
    return at >= from.getTime() && at <= now.getTime();
  };

  const recorded = memories.filter((memory) => within(memory.createdAt));
  // Closed this week: the week's own work, plus anything older finally done.
  const finished = memories.filter(
    (memory) => memory.status !== 'active' && within(memory.updatedAt)
  );

  const open = memories.filter((memory) => memory.status === 'active');
  const slipped = open.filter((memory) => {
    const due = dueAt(memory);
    return due !== null && due.getTime() < now.getTime();
  });
  const ahead = open.filter((memory) => {
    const due = dueAt(memory);
    return due !== null && due.getTime() >= now.getTime();
  });

  const totals = new Map<string, number>();
  for (const memory of recorded) {
    if (memory.amount === null) continue;
    const currency = memory.currency ?? 'INR';
    totals.set(currency, (totals.get(currency) ?? 0) + memory.amount);
  }

  return {
    from,
    to: now,
    recorded,
    finished,
    slipped,
    ahead,
    spent: [...totals].map(([currency, total]) => ({ currency, total })),
  };
}
