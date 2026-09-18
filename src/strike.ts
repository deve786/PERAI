import { hasStatedTime } from './format';
import type { Memory, MemoryType } from './types';

/** Types that can fall due. A memory or a purchase already happened. */
const ACTIONABLE: readonly MemoryType[] = ['task', 'reminder', 'appointment'];

type Timed = Pick<Memory, 'type' | 'eventDate' | 'dateExpression' | 'status'>;

/**
 * Has the moment this was meant for gone by?
 *
 * Only for things you meant to do. An entry with no date was never due, so it
 * waits until you strike it yourself. A day with no clock time is not past
 * until that day is over — "call the bank on Friday" is not overdue at 9am on
 * Friday.
 */
export function hasPassed(memory: Timed, now: Date = new Date()): boolean {
  if (!ACTIONABLE.includes(memory.type)) return false;
  if (!memory.dateExpression) return false;

  const event = new Date(memory.eventDate);
  if (Number.isNaN(event.getTime())) return false;

  if (hasStatedTime(memory.dateExpression)) return event.getTime() <= now.getTime();

  const endOfDay = new Date(event);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay.getTime() <= now.getTime();
}

/**
 * Should this entry be shown struck through?
 *
 * Either you ticked it off, or its time has gone by. Passing time only draws
 * the line — the entry stays active in the record, so tapping puts it back and
 * nothing is marked done behind your back.
 */
export function isStruck(memory: Timed, now: Date = new Date()): boolean {
  return memory.status !== 'active' || hasPassed(memory, now);
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
