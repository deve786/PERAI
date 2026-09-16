import { useCallback, useEffect, useState } from 'react';
import { onDatabaseChange } from './db/client';
import { getTimeline, type TimelineFilters } from './db/queries';
import type { Memory } from './types';

/**
 * Live view of the timeline.
 *
 * Replaces drizzle's `useLiveQuery`: re-runs the query whenever SQLite reports
 * a write, so confirming a memory updates the list with no manual
 * invalidation — the same behaviour, over the async driver.
 */
export function useMemories(filters: TimelineFilters = {}) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const { category = null, type = null } = filters;

  const refresh = useCallback(async () => {
    try {
      setMemories(await getTimeline({ category, type }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [category, type]);

  useEffect(() => {
    let active = true;

    // Guard every async set: filters can change, or the screen can unmount,
    // before an in-flight query resolves.
    const run = () => {
      if (active) void refresh();
    };

    run();
    const unsubscribe = onDatabaseChange(run);

    return () => {
      active = false;
      unsubscribe();
    };
  }, [refresh]);

  return { memories, loading, error, refresh };
}
