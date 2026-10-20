import * as Updates from 'expo-updates';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { isShareBusy } from './shareProcessingStore';

/** Away at least this long before a pending update may reload the app. */
const SAFE_TO_RELOAD_AFTER_MS = 30_000;

/**
 * Keeps the installed app on the latest published update, without a rebuild
 * and without you having to force-close it.
 *
 *  - On launch, expo-updates checks and downloads in the background by itself
 *    (`checkAutomatically: ON_LOAD` in app.json), so launch is never delayed.
 *  - Each time the app comes back to the foreground, it checks again and
 *    quietly downloads anything new.
 *  - A downloaded update is applied the next time you return after being away
 *    for a while. Reloading the moment it arrives could wipe a note you were
 *    halfway through writing or recording; after 30 seconds away you are not
 *    mid-thought, so the reload is invisible.
 *
 * Does nothing in development or Expo Go, where updates are disabled.
 */
export function useAutoUpdate() {
  const { isUpdatePending } = Updates.useUpdates();
  const pending = useRef(isUpdatePending);
  pending.current = isUpdatePending;

  const leftAt = useRef<number | null>(null);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        leftAt.current = Date.now();
        return;
      }
      if (state !== 'active') return;

      const away = leftAt.current === null ? 0 : Date.now() - leftAt.current;
      leftAt.current = null;

      void (async () => {
        try {
          if (pending.current && away >= SAFE_TO_RELOAD_AFTER_MS) {
            // Arriving via Share (GPay handing over a payment) is also a
            // return after time away, but with work in flight: reloading
            // then restarted the app under it and left a blank screen. Give
            // a share a beat to announce itself and never reload under one —
            // the update just waits for the next ordinary return.
            await new Promise((resolve) => setTimeout(resolve, 1000));
            if (!isShareBusy()) {
              await Updates.reloadAsync();
              return;
            }
          }
          const check = await Updates.checkForUpdateAsync();
          if (check.isAvailable) await Updates.fetchUpdateAsync();
        } catch {
          // Offline or rate limited. Launch and the next foreground try again.
        }
      })();
    });

    return () => subscription.remove();
  }, []);
}
