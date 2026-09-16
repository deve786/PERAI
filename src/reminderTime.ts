import { hasStatedTime } from './format';
import type { Memory } from './types';

/** Date-only reminders ("renew passport next month") notify at this hour. */
export const DEFAULT_REMINDER_HOUR = 9;
/** Appointments with a stated time notify this long before they start. */
export const APPOINTMENT_LEAD_MINUTES = 30;
/** A date-only reminder for today whose 9 AM has already passed. */
export const LATE_TODAY_DELAY_MINUTES = 60;

type Timed = Pick<Memory, 'type' | 'eventDate' | 'dateExpression' | 'status'>;

/**
 * When should this entry notify you? Null means it never should.
 *
 * Kept free of native imports so the rules are unit-tested in plain Node
 * (scripts/test-logic.ts). The rules:
 *
 *  - Only active reminders and appointments notify. Tasks, purchases and
 *    memories are records, not alarms.
 *  - A stated clock time is honoured: a reminder fires at it, an appointment
 *    fires 30 minutes before so there is time to get there.
 *  - No stated time means 9:00 AM on that day. If that is today and 9 AM has
 *    already passed, it fires an hour from now rather than being silently
 *    dropped — "remind me to call mom today" said at 2 PM should still remind.
 *  - Anything that works out to the past does not notify.
 */
export function reminderTime(memory: Timed, now: Date = new Date()): Date | null {
  if (memory.type !== 'reminder' && memory.type !== 'appointment') return null;
  if (memory.status !== 'active') return null;

  const event = new Date(memory.eventDate);
  if (Number.isNaN(event.getTime())) return null;

  let at: Date;
  if (hasStatedTime(memory.dateExpression)) {
    at =
      memory.type === 'appointment'
        ? new Date(event.getTime() - APPOINTMENT_LEAD_MINUTES * 60_000)
        : event;
  } else {
    at = new Date(event);
    at.setHours(DEFAULT_REMINDER_HOUR, 0, 0, 0);

    const sameDay = at.toDateString() === now.toDateString();
    if (sameDay && at.getTime() <= now.getTime()) {
      at = new Date(now.getTime() + LATE_TODAY_DELAY_MINUTES * 60_000);
    }
  }

  return at.getTime() > now.getTime() ? at : null;
}

/** "FRI 18 SEP, 09:00" — when a reminder will go off. */
export function reminderLabel(at: Date): string {
  const day = at
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/,/g, '');
  const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${time}`.toUpperCase();
}
