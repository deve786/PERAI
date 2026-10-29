import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

/**
 * A short notice at the bottom of the screen, with one action: almost always
 * Undo.
 *
 * Undo replaces "are you sure?". A question before every delete is friction
 * on the ninety-nine times you meant it, to guard against the one you did not;
 * a few seconds to take it back costs nothing when you did mean it.
 *
 * The work being undone can be done one of two ways:
 *
 * - Already done, with `onAction` putting it back (marking something done
 *   is cheap to reverse).
 * - Held back, with `onCommit` doing it only once the notice goes without
 *   being undone. Used where the work is hard to reverse cleanly — deleting
 *   an expense also moves an account balance and removes a refund entry — so
 *   nothing happens at all until the chance to undo has passed.
 *
 * A held-back commit still happens if the notice is replaced by another, if
 * the screen it came from is left, or if the app goes to the background, so
 * a delete you meant is never quietly lost.
 *
 * Imperative like showDialog, rendered once at the root by SnackbarHost.
 */

export interface SnackbarRequest {
  message: string;
  /** Defaults to "Undo". */
  actionLabel?: string;
  /** Pressing the action. For held-back work, this is the undo itself. */
  onAction?: () => void;
  /** Held-back work, done once the notice goes without its action pressed. */
  onCommit?: () => void | Promise<void>;
  /** Milliseconds on screen. Defaults to 5000. */
  duration?: number;
}

interface Current extends SnackbarRequest {
  id: number;
}

let current: Current | null = null;
let nextId = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function clearTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

/** Let the notice go, doing its held-back work. */
function settle() {
  const leaving = current;
  clearTimer();
  current = null;
  emit();
  if (leaving?.onCommit) {
    void Promise.resolve(leaving.onCommit()).catch((err) => {
      console.warn('A held-back action failed:', err);
    });
  }
}

export function showSnackbar(request: SnackbarRequest): void {
  // The one already showing goes first, keeping its promise.
  if (current) settle();
  current = { ...request, id: nextId++ };
  emit();
  timer = setTimeout(settle, request.duration ?? 5000);
}

/** The action was pressed: run it, and drop the held-back work. */
export function pressSnackbarAction(): void {
  const pressed = current;
  clearTimer();
  current = null;
  emit();
  pressed?.onAction?.();
}

/** Swiped away or tapped closed: the same as letting it time out. */
export function dismissSnackbar(): void {
  if (current) settle();
}

export function useSnackbar() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => current
  );
}

// Leaving the app is the same as the notice timing out: whatever was held back
// is done now, rather than lost if the app is closed from the background.
AppState.addEventListener('change', (state) => {
  if (state !== 'active' && current) settle();
});
