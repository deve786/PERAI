/**
 * When something routine comes round again.
 *
 * Pure, so the awkward parts — month ends, and an entry missed for weeks —
 * are unit tested in plain Node.
 */
import type { Repeat } from './types';

/** One step on. Month lengths are clamped: 31 Jan + a month is 28 Feb. */
function step(from: Date, repeat: Repeat): Date {
  const next = new Date(from);
  if (repeat === 'daily') {
    next.setDate(next.getDate() + 1);
    return next;
  }
  if (repeat === 'weekly') {
    next.setDate(next.getDate() + 7);
    return next;
  }

  const wanted = next.getDate();
  // Move to the first before changing month, or 31 March + a month would skip
  // April entirely by overflowing into May.
  next.setDate(1);
  next.setMonth(next.getMonth() + 1);
  const lastOfMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(wanted, lastOfMonth));
  return next;
}

/**
 * The next time this falls due after now, keeping its time of day.
 *
 * Always lands in the future: something weekly that went unticked for a month
 * comes back on the next one, not on four missed dates in a row.
 */
export function nextOccurrence(
  eventDateISO: string,
  repeat: Repeat,
  now: Date = new Date()
): string {
  const start = new Date(eventDateISO);
  if (Number.isNaN(start.getTime())) return eventDateISO;

  let next = step(start, repeat);
  // Guarded: a clock set far back should not spin here.
  for (let guard = 0; next.getTime() <= now.getTime() && guard < 500; guard += 1) {
    next = step(next, repeat);
  }
  return next.toISOString();
}
