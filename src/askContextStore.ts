import { useFocusEffect } from 'expo-router';
import { useCallback, useSyncExternalStore } from 'react';

/**
 * What the screen in front of you is about, for the floating Ask button.
 *
 * A question asked from a screen is almost always about that screen. Asked
 * from the Minicoy trip, "how much did the tickets come to?" means Minicoy's
 * tickets; asked from October's spending, "what was the biggest?" means
 * October's. A screen registers its subject while it is focused, and the Ask
 * button opens with the question already started on it.
 */
export interface AskContext {
  /** Shown on the button: "Ask about Minicoy". */
  label: string;
  /** The start of the question, put in the box for you to finish. */
  prefill: string;
}

let current: AskContext | null = null;
const listeners = new Set<() => void>();

function set(next: AskContext | null) {
  current = next;
  for (const listener of listeners) listener();
}

export function useAskContext(): AskContext | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => current
  );
}

/**
 * Register what this screen is about while it is in front. Cleared when it
 * loses focus, so the next screen never inherits a stale subject.
 */
export function useProvideAskContext(context: AskContext | null): void {
  const label = context?.label ?? null;
  const prefill = context?.prefill ?? null;
  useFocusEffect(
    useCallback(() => {
      set(label !== null && prefill !== null ? { label, prefill } : null);
      return () => set(null);
    }, [label, prefill])
  );
}
