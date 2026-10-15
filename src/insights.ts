import { addDays, daysBetween, toStr } from './expense/dates';
import type { Memory, MemoryType } from './types';

/** Types that stand for something to do — the only ones a completion rate means anything for. */
export const ACTIONABLE_TYPES: MemoryType[] = ['task', 'reminder', 'appointment'];
/** Wants rather than records: what fills the Lists tab. */
export const WISHLIST_TYPES: MemoryType[] = ['play', 'watch', 'wish'];

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface Bucket {
  date: string;
  label: string;
  total: number;
}

export interface Counted {
  name: string;
  count: number;
}

export interface MemoryInsights {
  /** Entries entered during the period. */
  captured: number;
  byType: Counted[];
  byCategory: Counted[];
  perDay: Bucket[];
  topPeople: Counted[];
  busiestWeekday: Counted | null;
  /** Of the actionable entries captured in the period, how many are finished. */
  done: number;
  open: number;
  /** 0..1, or null when the period holds nothing actionable to rate. */
  completionRate: number | null;
  /** Current state rather than period-scoped: still active and already past due. */
  overdue: number;
  wishlistOpen: number;
  wishlistDone: number;
  /** Consecutive days ending today on which something was captured. */
  streak: number;
  /** What purchases recorded by voice in this period came to. */
  purchaseTotal: number;
}

/** The local calendar day an ISO timestamp falls on. */
export function localDay(iso: string): string {
  return toStr(new Date(iso));
}

function rank(counts: Map<string, number>): Counted[] {
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Daily buckets for a short span, weekly for a season, monthly beyond that —
 * the same thresholds the spending trend uses, so the two charts on the screen
 * are always counting over the same shape of time.
 */
function bucket(days: string[], from: string, to: string): Bucket[] {
  const span = daysBetween(from, to);
  const out: Bucket[] = [];

  if (span <= 45) {
    const counts = new Map<string, number>();
    for (const day of days) counts.set(day, (counts.get(day) ?? 0) + 1);
    for (let i = 0; i < span; i++) {
      const day = addDays(from, i);
      out.push({ date: day, label: String(Number(day.slice(8, 10))), total: counts.get(day) ?? 0 });
    }
    return out;
  }

  if (span <= 190) {
    const buckets = Math.ceil(span / 7);
    for (let i = 0; i < buckets; i++) {
      const start = addDays(from, i * 7);
      const end = addDays(start, 6) > to ? to : addDays(start, 6);
      out.push({
        date: start,
        label: `W${i + 1}`,
        total: days.filter((day) => day >= start && day <= end).length,
      });
    }
    return out;
  }

  const counts = new Map<string, number>();
  for (const day of days) {
    const key = day.slice(0, 7);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const key of [...counts.keys()].sort()) {
    out.push({ date: `${key}-01`, label: key.slice(5), total: counts.get(key)! });
  }
  return out;
}

/** How many days in a row, counting back from today, hold at least one entry. */
function captureStreak(all: Memory[], now: Date): number {
  const days = new Set(all.map((memory) => localDay(memory.createdAt)));
  let streak = 0;
  let cursor = toStr(now);
  // Nothing today yet does not break a run that is otherwise unbroken — the day
  // is not over, so start from yesterday in that case.
  if (!days.has(cursor)) {
    cursor = addDays(cursor, -1);
    if (!days.has(cursor)) return 0;
  }
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/**
 * Everything the Insights tab says about the record half of the app.
 *
 * Capture-shaped figures (what was entered, of what kind, with whom) are scoped
 * to the chosen period by when the entry was *made*. State-shaped figures —
 * what is overdue, what is still on the lists, the streak — are about right
 * now and ignore the period, because "overdue last March" is not a thing a
 * person wants to know.
 */
export function memoryInsights(
  all: Memory[],
  from: string,
  to: string,
  now: Date = new Date()
): MemoryInsights {
  const inPeriod = all.filter((memory) => {
    const day = localDay(memory.createdAt);
    return day >= from && day <= to;
  });

  const types = new Map<string, number>();
  const categories = new Map<string, number>();
  const people = new Map<string, number>();
  const weekdays = new Map<string, number>();

  let done = 0;
  let open = 0;
  let purchaseTotal = 0;

  for (const memory of inPeriod) {
    types.set(memory.type, (types.get(memory.type) ?? 0) + 1);
    categories.set(memory.category, (categories.get(memory.category) ?? 0) + 1);

    const weekday = WEEKDAYS[new Date(memory.createdAt).getDay()];
    weekdays.set(weekday, (weekdays.get(weekday) ?? 0) + 1);

    for (const name of (memory.people ?? '').split(',')) {
      const clean = name.trim();
      if (clean) people.set(clean, (people.get(clean) ?? 0) + 1);
    }

    if (ACTIONABLE_TYPES.includes(memory.type)) {
      if (memory.status === 'done') done += 1;
      else if (memory.status === 'active') open += 1;
    }

    if (memory.type === 'purchase' && memory.amount !== null) {
      purchaseTotal += memory.amount;
    }
  }

  const rated = done + open;
  const nowMs = now.getTime();

  const overdue = all.filter(
    (memory) =>
      memory.status === 'active' &&
      ACTIONABLE_TYPES.includes(memory.type) &&
      new Date(memory.eventDate).getTime() < nowMs
  ).length;

  const wishlist = all.filter((memory) => WISHLIST_TYPES.includes(memory.type));
  const busiest = rank(weekdays)[0] ?? null;

  return {
    captured: inPeriod.length,
    byType: rank(types),
    byCategory: rank(categories),
    perDay: bucket(inPeriod.map((memory) => localDay(memory.createdAt)), from, to),
    topPeople: rank(people).slice(0, 5),
    busiestWeekday: busiest,
    done,
    open,
    completionRate: rated > 0 ? done / rated : null,
    overdue,
    wishlistOpen: wishlist.filter((memory) => memory.status === 'active').length,
    wishlistDone: wishlist.filter((memory) => memory.status !== 'active').length,
    streak: captureStreak(all, now),
    purchaseTotal,
  };
}
