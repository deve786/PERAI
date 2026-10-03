import { onDatabaseChange } from './db/client';
import { getAllMemories, setMemoryStatus } from './db/queries';
import { overdueToClose } from './strike';

/** Times move on slowly; there is no point checking more often than this. */
const SWEEP_MS = 5 * 60_000;

/**
 * Record anything whose moment has gone by as done.
 *
 * The strike is stored rather than drawn from the date each time, so it is in
 * the record itself and travels to the server like any other change. Tapping an
 * overdue entry back to active keeps it active: `hasPassed` in strike.ts leaves
 * alone anything touched after it fell due.
 */
export async function sweepOverdue(now: Date = new Date()): Promise<number> {
  const ids = overdueToClose(await getAllMemories(), now);
  for (const id of ids) await setMemoryStatus(id, 'done');
  return ids.length;
}

/** Sweep at launch, shortly after any change, and every few minutes after. */
export function startOverdueSweep(): () => void {
  void sweepOverdue().catch(() => {
    // A failed sweep costs nothing: the line is still drawn on screen, and the
    // next sweep will store it.
  });

  let pending: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = onDatabaseChange(() => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => void sweepOverdue().catch(() => {}), 1500);
  });
  const timer = setInterval(() => void sweepOverdue().catch(() => {}), SWEEP_MS);

  return () => {
    if (pending) clearTimeout(pending);
    clearInterval(timer);
    unsubscribe();
  };
}
