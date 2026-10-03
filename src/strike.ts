import { hasStatedTime } from './format';
import type { Memory, MemoryType } from './types';

/** Types that can fall due. A memory or a purchase already happened. */
const ACTIONABLE: readonly MemoryType[] = ['task', 'reminder', 'appointment'];

type Timed = Pick<
  Memory,
  'type' | 'eventDate' | 'dateExpression' | 'status' | 'updatedAt'
>;

/**
 * The moment this entry was for, or null when it was never due.
 *
 * Only things you meant to do can fall due. An entry with no date given waits
 * until you strike it yourself. A day with no clock time lasts until the day is
 * over — "call the bank on Friday" is not overdue at 9am on Friday.
 */
export function dueAt(memory: Timed): Date | null {
  if (!ACTIONABLE.includes(memory.type)) return null;
  if (!memory.dateExpression) return null;

  const event = new Date(memory.eventDate);
  if (Number.isNaN(event.getTime())) return null;
  if (hasStatedTime(memory.dateExpression)) return event;

  const endOfDay = new Date(event);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay;
}

/**
 * Has its moment gone by, without you saying otherwise since?
 *
 * Touching an entry after it fell due — tapping it back to active — means you
 * still intend to do it, so it is left alone from then on. Without that, an
 * overdue entry could never be un-struck: it would be marked done again on the
 * next sweep.
 */
export function hasPassed(memory: Timed, now: Date = new Date()): boolean {
  const due = dueAt(memory);
  if (!due || due.getTime() > now.getTime()) return false;

  const touched = new Date(memory.updatedAt).getTime();
  return Number.isNaN(touched) || touched <= due.getTime();
}

/** Struck through: ticked off, or its moment has gone by. */
export function isStruck(memory: Timed, now: Date = new Date()): boolean {
  return memory.status !== 'active' || hasPassed(memory, now);
}

/**
 * Entries whose time has gone by and that are still marked active — the ones a
 * sweep should now record as done, so the strike is in the record itself and
 * reaches every device, rather than being redrawn from the date each time.
 */
export function overdueToClose<T extends Timed & { id: string }>(
  memories: T[],
  now: Date = new Date()
): string[] {
  return memories
    .filter((memory) => memory.status === 'active' && hasPassed(memory, now))
    .map((memory) => memory.id);
}

/**
 * The same entries with the struck ones moved to the bottom, each group left
 * in the order it came in.
 */
export function sinkStruck<T extends Timed>(memories: T[], now: Date = new Date()): T[] {
  const open: T[] = [];
  const struck: T[] = [];
  for (const memory of memories) {
    (isStruck(memory, now) ? struck : open).push(memory);
  }
  return [...open, ...struck];
}
