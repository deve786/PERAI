import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { onDatabaseChange } from './db/client';
import { getAllMemories } from './db/queries';
import { hasStatedTime } from './format';
import { APPOINTMENT_LEAD_MINUTES, reminderTime } from './reminderTime';
import type { Memory } from './types';

// Versioned: Android locks a channel's settings the moment it's first created
// on a device, so any change to sound or importance needs a fresh id to reach
// phones that already have the old channel.
const CHANNEL_ID = 'reminders-v4';
const OLD_CHANNEL_IDS = ['reminders', 'reminders-v2', 'reminders-v3'];
// Bundled via the expo-notifications plugin's `sounds` in app.json, which
// copies it into the Android app's res/raw at build time.
const REMINDER_SOUND = 'reminder_chime.wav';
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
      importance: Notifications.AndroidImportance.MAX,
      lightColor: '#2F5D45',
      sound: REMINDER_SOUND,
      // Played on the alarm stream rather than the notification stream, which
      // follows the ringer and is silent whenever the phone is on vibrate or
      // its notification volume is down. A reminder you asked for should be
      // heard the way an alarm is.
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
      enableVibrate: true,
      vibrationPattern: [0, 400, 250, 400],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
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
        sound: REMINDER_SOUND,
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
