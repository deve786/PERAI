import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { completeMemory } from './complete';
import { getMemory, updateMemory } from './db/queries';
import { logOk } from './log';
import { ACTION_DONE, ACTION_TOMORROW } from './reminders';

/** The weekly review reminder carries this instead of an entry id. */
export const REVIEW_NOTIFICATION = 'weekly-review';

/**
 * Answers the buttons on a reminder, so one can be dealt with from the lock
 * screen without opening the app.
 *
 * Done closes the entry — or moves a repeating one to its next turn, the same
 * rule as everywhere else. Tomorrow moves it on a day, which reschedules its
 * reminder, because the sync in src/reminders.ts rebuilds alarms from the
 * record after every write.
 */
export function useNotificationActions(ready: boolean) {
  const router = useRouter();

  useEffect(() => {
    if (!ready || Platform.OS === 'web') return;

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void (async () => {
        const data = response.notification.request.content.data as {
          memoryId?: string;
          kind?: string;
        };

        if (data?.kind === REVIEW_NOTIFICATION) {
          router.push('/review');
          return;
        }

        const id = data?.memoryId;
        if (!id) return;

        const memory = await getMemory(id);
        if (!memory) return;

        if (response.actionIdentifier === ACTION_DONE) {
          await completeMemory(memory);
          return;
        }
        if (response.actionIdentifier === ACTION_TOMORROW) {
          const when = new Date(memory.eventDate);
          when.setDate(when.getDate() + 1);
          await updateMemory(id, { eventDate: when.toISOString() });
          logOk('Pushed to tomorrow from the notification', memory.title);
          return;
        }

        // The notification itself was tapped: open the entry.
        router.push(`/entry/${id}`);
      })();
    });

    return () => subscription.remove();
  }, [ready, router]);
}
