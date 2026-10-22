/** A cancelled ticket with no refund amount is nagged about this often. */
export const REFUND_REMINDER_EVERY_DAYS = 2;
/** At what hour of the day (local time) the reminder arrives. */
export const REFUND_REMINDER_HOUR = 10;

/**
 * The next `count` times to remind about a refund that's been pending since
 * `since`: every 2 days from the day it was marked cancelled, at 10:00, and
 * only those still ahead of `now`. Because the times are counted from the
 * cancelled date, rescheduling at every app launch never pushes them back.
 */
export function refundReminderTimes(since: Date | string, now: Date, count: number): Date[] {
  const start = new Date(since);
  if (isNaN(start.getTime())) return [];
  const out: Date[] = [];
  const earliest = now.getTime() + 60_000;
  for (let k = 1; out.length < count && k < 2000; k++) {
    const at = new Date(start);
    at.setDate(at.getDate() + k * REFUND_REMINDER_EVERY_DAYS);
    at.setHours(REFUND_REMINDER_HOUR, 0, 0, 0);
    if (at.getTime() > earliest) out.push(at);
  }
  return out;
}
