import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { onDatabaseChange } from '../db/client';
import { logFail, logOk } from '../log';
import { currentEmail, isConfigured } from './client';
import { lastSyncedAt, pendingCount, syncNow } from './sync';

/** A quiet spell after a write, so saving several entries syncs once. */
const AFTER_WRITE_MS = 2500;
/** A slow heartbeat, for a phone that has been sitting open. */
const HEARTBEAT_MS = 60_000;

export type SyncState = 'off' | 'idle' | 'syncing' | 'error';

/**
 * Keeps the phone and the server in step, and reports where things stand.
 *
 * Runs on launch, a moment after any change, on a slow timer, and whenever the
 * app comes back to the foreground — the moment a phone that was offline is
 * most likely to have a connection again.
 */
export function useSync() {
  const [state, setState] = useState<SyncState>('off');
  const [email, setEmail] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [lastAt, setLastAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refreshStatus = useCallback(async () => {
    if (!mounted.current) return;
    setPending(await pendingCount().catch(() => 0));
    setLastAt(await lastSyncedAt().catch(() => null));
    setEmail(await currentEmail().catch(() => null));
  }, []);

  const run = useCallback(async () => {
    if (!isConfigured()) {
      setState('off');
      return;
    }
    setState('syncing');
    try {
      const outcome = await syncNow();
      if (!mounted.current) return;
      setError(null);
      setState(outcome === null ? 'off' : 'idle');
      if (outcome && outcome.pushed + outcome.pulled > 0) {
        logOk('Backed up', `${outcome.pushed} sent, ${outcome.pulled} received`);
      }
    } catch (err) {
      if (!mounted.current) return;
      const reason = err instanceof Error ? err.message : String(err);
      setError(reason);
      setState('error');
      logFail('Backup failed', reason);
    } finally {
      await refreshStatus();
    }
  }, [refreshStatus]);

  useEffect(() => {
    mounted.current = true;
    void run();

    let afterWrite: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = onDatabaseChange(() => {
      void refreshStatus();
      if (afterWrite) clearTimeout(afterWrite);
      afterWrite = setTimeout(() => void run(), AFTER_WRITE_MS);
    });

    const heartbeat = setInterval(() => void run(), HEARTBEAT_MS);
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') void run();
    });

    return () => {
      mounted.current = false;
      if (afterWrite) clearTimeout(afterWrite);
      clearInterval(heartbeat);
      unsubscribe();
      appState.remove();
    };
  }, [run, refreshStatus]);

  return { state, email, pending, lastAt, error, syncNow: run, refreshStatus };
}
