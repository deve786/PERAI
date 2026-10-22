import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getSetting, listRefundsPending } from './db';
import { refundReminderTimes } from './refundSchedule';

/** The notification's `kind`; tapping it opens that expense to enter the refund. */
export const REFUND_NOTIFICATION = 'refund-due';

const CHANNEL_ID = 'refund-nudges';
/** Reminders scheduled ahead per ticket, and overall — Android caps pending alarms. */
const AHEAD_PER_TICKET = 8;
const AHEAD_TOTAL = 60;

/**
 * Schedules a reminder every 2 days for each cancelled ticket whose refund
 * amount hasn't been entered. Called from src/reminders.ts, which cancels
 * every scheduled notification and rebuilds them from the data on each sync;
 * once the refund is entered (or the expense deleted) nothing is scheduled
 * for it any more.
 */
export async function scheduleRefundReminders(): Promise<void> {
  const pending = await listRefundsPending();
  if (pending.length === 0) return;

  if (Platform.OS === 'android') {
    // A calmer channel than the alarm-style one used for reminders.
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Refund reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#2F5D45',
    }).catch(() => {});
  }

  const symbol = await getSetting('symbol', '₹');
  const now = new Date();
  let left = AHEAD_TOTAL;
  for (const p of pending) {
    const what = p.note?.trim() || 'Your ticket';
    for (const [i, at] of refundReminderTimes(p.since, now, AHEAD_PER_TICKET).entries()) {
      if (left-- <= 0) return;
      await Notifications.scheduleNotificationAsync({
        identifier: `refund-${p.id}-${i}`,
        content: {
          title: 'Refund not entered yet',
          body: `${what} (${symbol}${p.amount}) was cancelled. Tap to enter the refunded amount.`,
          data: { kind: REFUND_NOTIFICATION, expenseId: p.id },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL_ID },
      });
    }
  }
}
