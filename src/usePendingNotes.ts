import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from './ai/client';
import { onDatabaseChange } from './db/client';
import { isQuotaError, quotaWait } from './ai/quota';
import { deferPendingNote, dropPendingNote, getPendingNotes, markNoteTried } from './db/queries';
import { fileNote, type FilingContext } from './fileNote';
import { logFail, logOk } from './log';
import { nextDue, RETRY_TICK_MS, type PendingNote } from './pendingNotes';

/**
 * Notes waiting to be filed, and the loop that keeps trying them.
 *
 * A note lands in the queue when the AI call fails — offline, or the free
 * tier's quota spent. Nothing said is lost: the queue survives the app being
 * closed, is retried at launch and on a timer, and is shown on the Record tab
 * so it is never silently stuck.
 */
export function usePendingNotes(context: FilingContext, enabled: boolean) {
  const [notes, setNotes] = useState<PendingNote[]>([]);
  const running = useRef(false);
  const latest = useRef(context);
  latest.current = context;

  const refresh = useCallback(async () => {
    try {
      setNotes(await getPendingNotes());
    } catch {
      // The screen is still usable without the queue.
    }
  }, []);

  /** File one note that is due. One at a time: a failing call is usually a
   *  quota or network problem, and hammering it would only make it worse. */
  const runDue = useCallback(
    async (forceId?: string) => {
      if (running.current || !enabled) return;
      running.current = true;
      try {
        const queued = await getPendingNotes();
        const note = forceId
          ? queued.find((item) => item.id === forceId)
          : nextDue(queued);
        if (!note) return;

        try {
          await fileNote(note.text, latest.current);
          await dropPendingNote(note.id);
          logOk('Filed a waiting note', note.text.slice(0, 60));
        } catch (err) {
          const reason = describeError(err);
          const raw = err instanceof Error ? err.message : String(err);

          // Same as a title check: when the day's AI is spent, wait for it to
          // come back instead of using up every try in the meantime.
          if (isQuotaError(raw)) {
            await deferPendingNote(note.id, quotaWait(raw).retryAt, reason);
            logFail('Waiting on quota to file a note', reason);
          } else {
            await markNoteTried(note.id, reason);
            logFail('Waiting note still failing', reason);
          }
        }
        await refresh();
      } finally {
        running.current = false;
      }
    },
    [enabled, refresh]
  );

  useEffect(() => {
    void refresh();
    const unsubscribe = onDatabaseChange(() => void refresh());
    return unsubscribe;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    void runDue();
    const timer = setInterval(() => void runDue(), RETRY_TICK_MS);
    return () => clearInterval(timer);
  }, [enabled, runDue]);

  return {
    notes,
    /** Try one now, whatever its backoff says. */
    retry: (id: string) => void runDue(id),
    forget: (id: string) => void dropPendingNote(id).then(refresh),
  };
}
