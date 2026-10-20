import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

/**
 * Only one copy of the app may draw at a time.
 *
 * Sharing into PERAI from some apps (GPay among them) makes Android start a
 * second copy of the app's screen in the sharing app's task — and with it a
 * second app tree in the same JS runtime. That copy's navigation takes over
 * the router's shared state, and when the share library closes it a moment
 * later, every navigation in the real app goes nowhere: the blank page after
 * opening the shared expense, until the app is restarted.
 * (expo-share-intent issue #189.)
 *
 * The first tree to mount owns the screen; any other draws nothing, and takes
 * over only once the owner is gone — which is what happens when the share is
 * what started the app: the throwaway copy mounts first, then hands over to
 * the real one.
 */

let owner: symbol | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const currentOwner = () => owner;

export function SingleRoot({ children }: { children: ReactNode }) {
  // Claimed on first render, not in an effect, so the usual single copy draws
  // straight away with no blank frame.
  const [id] = useState(() => {
    const mine = Symbol('app-root');
    if (owner === null) owner = mine;
    return mine;
  });
  const active = useSyncExternalStore(subscribe, currentOwner, currentOwner);

  useEffect(() => {
    // A copy left waiting takes over as soon as the owner lets go.
    if (owner === null) {
      owner = id;
      emit();
    }
  }, [active, id]);

  useEffect(
    () => () => {
      if (owner === id) {
        owner = null;
        emit();
      }
    },
    [id]
  );

  return active === id ? <>{children}</> : null;
}
