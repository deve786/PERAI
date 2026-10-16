import { useSyncExternalStore } from 'react';

/**
 * The app's own popups, in place of the operating system's.
 *
 * Android's alert is a different piece of design from everything around it —
 * its own type, its own shapes, its own idea of where a destructive button
 * goes. One dialog drawn by the app keeps a question about your own record
 * looking like the record.
 *
 * Imperative, like the alert it replaces, so a call site stays one line and
 * code outside a component (a failed update check, say) can still ask.
 * Rendered by DialogHost, mounted once at the root.
 */

export interface DialogAction {
  label: string;
  onPress?: () => void;
  /** Red, and placed last: deleting, erasing, signing out. */
  destructive?: boolean;
  /** Dismisses without doing anything. Shown first, quietly. */
  cancel?: boolean;
}

export interface DialogRequest {
  title: string;
  message?: string;
  /** Defaults to a single OK, which only closes it. */
  actions?: DialogAction[];
}

let request: (DialogRequest & { id: number }) | null = null;
let nextId = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Ask something, or say something. Replaces Alert.alert. */
export function showDialog(next: DialogRequest): void {
  request = { ...next, id: nextId++ };
  emit();
}

export function dismissDialog(): void {
  request = null;
  emit();
}

export function useDialogRequest() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => request,
    () => request
  );
}
