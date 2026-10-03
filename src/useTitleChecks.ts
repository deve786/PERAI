import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from './ai/client';
import { searchTitle } from './ai/spelling';
import { onDatabaseChange } from './db/client';
import {
  dropPendingTitle,
  getPendingTitles,
  markTitleTried,
  rememberSpelling,
  updateMemoryTitle,
} from './db/queries';
import { MAX_ATTEMPTS, nextDue, type PendingTitle } from './pendingNotes';

/** How often the queue is looked at while the app is open. */
const TICK_MS = 15_000;

export interface TitleFix {
  from: string;
  to: string;
}

/**
 * Checks the names of newly added games, films and products against a web
 * search, one at a time, after they are already saved.
 *
 * The search takes far too long to make anyone wait for it, so this runs
 * behind the screen: you can keep adding while it works, the entries being
 * checked are shown as such, and the queue survives the app being closed.
 * When a name comes back better spelled it is corrected in place, remembered
 * for next time, and synced like any other change.
 */
export function useTitleChecks(enabled: boolean) {
  const [checking, setChecking] = useState<PendingTitle[]>([]);
  const [lastFix, setLastFix] = useState<TitleFix | null>(null);
  const running = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setChecking(await getPendingTitles());
    } catch {
      // The screen works without the queue.
    }
  }, []);

  const runDue = useCallback(async () => {
    if (running.current || !enabled) return;
    running.current = true;
    try {
      const queued = await getPendingTitles();
      const due = nextDue(queued);
      if (!due) return;

      try {
        const better = await searchTitle(due.title, due.type);
        if (better && better !== due.title) {
          await updateMemoryTitle(due.id, better);
          await rememberSpelling(due.title, better, 'search');
          setLastFix({ from: due.title, to: better });
        }
        // Searched either way: nothing more to do for this one.
        await dropPendingTitle(due.id);
      } catch (err) {
        // Out of quota or offline: try again later, and give up quietly after
        // enough tries rather than leaving it listed for ever.
        if (due.attempts + 1 >= MAX_ATTEMPTS) await dropPendingTitle(due.id);
        else await markTitleTried(due.id, describeError(err));
      }
      await refresh();
    } finally {
      running.current = false;
    }
  }, [enabled, refresh]);

  useEffect(() => {
    void refresh();
    const unsubscribe = onDatabaseChange(() => void refresh());
    return unsubscribe;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    void runDue();
    const timer = setInterval(() => void runDue(), TICK_MS);
    return () => clearInterval(timer);
  }, [enabled, runDue]);

  return { checking, lastFix };
}
