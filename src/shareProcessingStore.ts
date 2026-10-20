import { getSharedPayloads } from 'expo-sharing';

/**
 * Whether a share from another app (GPay's payment image, chiefly) is being
 * handled — so useAutoUpdate never restarts the app for a pending update
 * underneath one.
 */

/** How long after a share starts nothing else may restart the app under it. */
const SHARE_QUIET_MS = 60_000;

let lastShareAt = 0;

/** Called when the shared-payment screen starts reading a share. */
export function markShareBusy(): void {
  lastShareAt = Date.now();
}

/**
 * True for a minute after a share starts, and whenever Android has already
 * handed one over but nothing has read it yet — that payload is set before
 * the app's own "back in the foreground" signal reaches JS.
 */
export function isShareBusy(): boolean {
  if (Date.now() - lastShareAt < SHARE_QUIET_MS) return true;
  try {
    return getSharedPayloads().length > 0;
  } catch {
    return false;
  }
}
