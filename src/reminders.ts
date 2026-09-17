import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { onDatabaseChange } from './db/client';
import { getAllMemories } from './db/queries';
import { hasStatedTime } from './format';
import { APPOINTMENT_LEAD_MINUTES, reminderTime } from './reminderTime';
import type { Memory } from './types';

// Versioned rather than 'reminders': Android locks a channel's settings the
// moment it's first created on a device, and the original channel here was
// created with no `sound` set — silent, on the phones that already had it.
// Changing the settings on that same id would never reach them; a fresh id
// guarantees everyone gets the version with sound.
const CHANNEL_ID = 'reminders-v2';
const OLD_CHANNEL_IDS = ['reminders'];
const supported = Platform.OS !== 'web';

let prepared = false;

/**
 * Show reminders even while the app is open, and give them their own Android
 * channel at high importance so they arrive as heads-up alerts. Android 13+
 * only shows the permission prompt once a channel exists, so this runs first.
 */
export async function prepareNotifications(): Promise<void> {
  if (!supported || prepared) return;
  prepared = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    for (const id of OLD_CHANNEL_IDS) {
      await Notifications.deleteNotificationChannelAsync(id).catch(() => {});
    }
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#2F5D45',
      sound: 'default',
    });
  }
}

/**
 * Whether notifications may be shown.
 *
 * @param ask prompt if the answer is not known yet. Only pass true right after
 *            the person saved a reminder, when the question makes sense.
 */
export async function notificationsAllowed(ask: boolean): Promise<boolean> {
  if (!supported) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!ask || !current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

function bodyFor(memory: Memory): string {
  if (memory.type === 'appointment') {
    return hasStatedTime(memory.dateExpression)
      ? `In ${APPOINTMENT_LEAD_MINUTES} minutes`
      : 'Today';
  }
  return memory.dateExpression
    ? `You asked to be reminded (${memory.dateExpression})`
    : 'You asked to be reminded';
}

/**
 * Make the phone's scheduled alarms match the database exactly.
 *
 * Everything is cancelled and rescheduled from the stored entries, so there is
 * one source of truth: saving, Undo, Edit and deleting all stay correct without
 * each of them managing notifications. The entry id is the notification id.
 */
async function syncNow(): Promise<void> {
  if (!supported) return;
  if (!(await notificationsAllowed(false))) return;

  const memories = await getAllMemories();
  await Notifications.cancelAllScheduledNotificationsAsync();

  const now = new Date();
  for (const memory of memories) {
    const at = reminderTime(memory, now);
    if (!at) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: memory.id,
      content: {
        title: memory.title,
        body: bodyFor(memory),
        data: { memoryId: memory.id },
        // On Android 8+ the channel's own `sound` above is what actually
        // governs this; this field is what matters on iOS, which has no
        // channels of its own.
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: at,
        channelId: CHANNEL_ID,
      },
    });
  }
}

// Serialise syncs: a cancel-all from one run must never land in the middle of
// another run's scheduling, or reminders would silently go missing.
let queue: Promise<void> = Promise.resolve();

export function syncReminders(): Promise<void> {
  queue = queue.then(syncNow).catch(() => {
    // A failed sync is retried on the next write or launch.
  });
  return queue;
}

/**
 * Keep alarms in step with the database for the life of the app: once at
 * launch, and again shortly after any write (debounced, since saving a
 * multi-event note writes several rows back to back).
 */
export function startReminderSync(): () => void {
  if (!supported) return () => {};

  void prepareNotifications().then(syncReminders);

  let pending: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = onDatabaseChange(() => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => void syncReminders(), 400);
  });

  return () => {
    if (pending) clearTimeout(pending);
    unsubscribe();
  };
}
