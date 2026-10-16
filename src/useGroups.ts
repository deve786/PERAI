import { useCallback, useEffect, useState } from 'react';
import { onDatabaseChange } from './db/client';
import { getAllMemories, getEmptyGroups } from './db/queries';
import { groupSummaries, type GroupSummary } from './groups';

/**
 * Live view of the groups.
 *
 * Two sources in one: the names carried by entries, and the names of groups
 * made before anything is in them. Re-read on any write, the same way the
 * timeline is, so making a group or ticking off its last task shows at once.
 */
export function useGroups() {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [empty, setEmpty] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [memories, made] = await Promise.all([getAllMemories(), getEmptyGroups()]);
      setEmpty(made);
      setGroups(groupSummaries(memories, new Date(), made));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return onDatabaseChange(() => void refresh());
  }, [refresh]);

  return { groups, empty, loading, refresh };
}
