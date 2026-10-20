import { useSyncExternalStore } from 'react';
import { ShareIntentModule } from 'expo-share-intent';

/**
 * Whether a share (GPay's payment image, or shared text) is currently being
 * read — and what to say while it is. Imperative, same shape as
 * dialogStore.ts, so useShareIntentCapture (which isn't a screen) can flip it
 * on and off without owning any UI itself. Drawn by ShareProcessingOverlay,
 * mounted once at the root.
 *
 * Exists because the whole read-the-share step used to be invisible: tapping
 * Share would open the app to whatever screen it last had, with nothing on
 * screen to say work was happening, for however long the AI call took — easy
 * to mistake for the app being stuck.
 */

interface ShareProcessingState {
  active: boolean;
  label: string;
}

/** How long after a share arrives nothing else (an update reload) may restart the app under it. */
const SHARE_QUIET_MS = 60_000;

let state: ShareProcessingState = { active: false, label: '' };
let lastShareAt = 0;
const listeners = new Set<() => void>();

// Stamped straight off the native event: Android delivers the share before
// the app's own "back in the foreground" signal reaches JS, so useAutoUpdate
// can tell a share hand-off apart from an ordinary return in time.
ShareIntentModule?.addListener('onChange', () => {
  lastShareAt = Date.now();
});

function emit() {
  for (const listener of listeners) listener();
}

export function setShareProcessing(active: boolean, label = ''): void {
  if (active) lastShareAt = Date.now();
  state = { active, label };
  emit();
}

/** True while a share is being read, and for a minute after one arrives. */
export function isShareBusy(): boolean {
  return state.active || Date.now() - lastShareAt < SHARE_QUIET_MS;
}

export function useShareProcessing() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state
  );
}
