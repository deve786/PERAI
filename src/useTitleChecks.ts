import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from './ai/client';
import { isQuotaError, quotaWait } from './ai/quota';
import { lookUpTitle } from './ai/spelling';
import { onDatabaseChange } from './db/client';
import {
  clearPendingTitles,
  deferTitleCheck,
  dropPendingTitle,
  dropStaleTitles,
  getPendingTitles,
  markTitleTried,
  rememberSpelling,
  updateMemoryTitle,
} from './db/queries';
import { logFail, logOk } from './log';
import { MAX_ATTEMPTS, nextDue, type PendingTitle } from './pendingNotes';

/** How often the queue is looked at while the app is open. */
const TICK_MS = 15_000;
/** After this long unchecked, the name you gave it simply stands. */
const STALE_DAYS = 3;

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
      await dropStaleTitles(new Date(Date.now() - STALE_DAYS * 24 * 3_600_000));
      const queued = await getPendingTitles();
      const due = nextDue(queued);
      if (!due) return;

      logOk(due.attempts > 0 ? 'Trying a name again' : 'Checking a name', due.title);
      try {
        const lookup = await lookUpTitle(due.title, due.type);
        // What the call actually did, so "looking it up" is not a black box.
        if (lookup) {
          logOk(
            `Asked ${lookup.source}`,
            `${lookup.model} · ${lookup.seconds}s · replied "${lookup.replied}"`
          );
        }

        const better = lookup?.accepted ?? null;
        if (better && better !== due.title) {
          await updateMemoryTitle(due.id, better);
          await rememberSpelling(due.title, better, 'search');
          setLastFix({ from: due.title, to: better });
          logOk('Name corrected', `${due.title} → ${better}`);
        } else if (lookup && !lookup.accepted) {
          // The reply was refused by the guard: a different title, a sequel,
          // or an explanation. Worth saying so rather than implying agreement.
          logOk('Kept your spelling', `"${lookup.replied}" was not close enough to be the same thing`);
        } else {
          logOk('Name checked, already right', due.title);
        }
        // Searched either way: nothing more to do for this one.
        await dropPendingTitle(due.id);
      } catch (err) {
        const reason = describeError(err);
        const raw = err instanceof Error ? err.message : String(err);

        // Out of AI for the day: wait for the quota rather than spending every
        // try against a wall and giving up hours before it returns.
        if (isQuotaError(raw)) {
          const wait = quotaWait(raw);
          await deferTitleCheck(due.id, wait.retryAt, reason);
          logFail('Name check waiting on quota', `${due.title} — ${reason}`);
          await refresh();
          return;
        }

        if (due.attempts + 1 >= MAX_ATTEMPTS) {
          await dropPendingTitle(due.id);
          logFail('Gave up checking a name', `${due.title} — ${reason}`);
        } else {
          await markTitleTried(due.id, reason);
          logFail('Name check failed, will retry', `${due.title} — ${reason}`);
        }
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

  /** Leave a name exactly as it was said, and stop looking it up. */
  const stop = useCallback(
    (item: PendingTitle) => {
      void dropPendingTitle(item.id).then(() => {
        logOk('Stopped checking a name', item.title);
        return refresh();
      });
    },
    [refresh]
  );

  const stopAll = useCallback(() => {
    void clearPendingTitles().then(() => {
      logOk('Stopped all name checks');
      return refresh();
    });
  }, [refresh]);

  return { checking, lastFix, stop, stopAll };
}
