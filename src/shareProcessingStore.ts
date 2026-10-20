import { useSyncExternalStore } from 'react';

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

let state: ShareProcessingState = { active: false, label: '' };
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setShareProcessing(active: boolean, label = ''): void {
  state = { active, label };
  emit();
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
