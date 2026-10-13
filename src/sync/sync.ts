import { getDb } from '../db/client';
import { getSetting, setSetting } from '../db/queries';
import { currentUserId, getSupabase, isConfigured } from './client';
import { nextCursor, shouldApplyRemote, toLocal, toRemote, type LocalRow, type RemoteRow } from './mapping';

const CURSOR_KEY = 'sync.cursor';
const LAST_SYNC_KEY = 'sync.lastAt';
const PUSH_BATCH = 200;
const PULL_BATCH = 500;
/** How long a deleted entry is kept around after the server has been told. */
const TOMBSTONE_DAYS = 30;

const SELECT_LOCAL = `
  id, raw_input AS rawInput, title, type, category, event_date AS eventDate,
  date_expression AS dateExpression, created_at AS createdAt, amount, currency,
  people, location, tags, priority, status, confirmed, repeat,
  updated_at AS updatedAt, deleted
`;

interface LocalRawRow extends Omit<LocalRow, 'confirmed' | 'deleted'> {
  confirmed: number;
  deleted: number;
}

const readLocal = (row: LocalRawRow): LocalRow => ({
  ...row,
  confirmed: row.confirmed === 1,
  deleted: row.deleted === 1,
});

export async function pendingCount(): Promise<number> {
  const row = await getDb().getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM memories WHERE dirty = 1'
  );
  return row?.n ?? 0;
}

export async function lastSyncedAt(): Promise<string | null> {
  return getSetting(LAST_SYNC_KEY);
}

/** Send everything changed here since the last successful push. */
async function push(userId: string): Promise<number> {
  const db = getDb();
  let sent = 0;

  for (;;) {
    const rows = await db.getAllAsync<LocalRawRow>(
      `SELECT ${SELECT_LOCAL} FROM memories WHERE dirty = 1 ORDER BY updated_at ASC LIMIT ?`,
      [PUSH_BATCH]
    );
    if (rows.length === 0) return sent;

    const payload = rows.map((row) => ({ ...toRemote(readLocal(row)), user_id: userId }));
    const { error } = await getSupabase().from('memories').upsert(payload, { onConflict: 'id' });
    if (error) throw new Error(error.message);

    // Only clear the flag on rows that have not changed again while in flight.
    const ids = rows.map((row) => row.id);
    const placeholders = ids.map(() => '?').join(',');
    await db.runAsync(
      `UPDATE memories SET dirty = 0
       WHERE id IN (${placeholders}) AND updated_at <= ?`,
      [...ids, rows[rows.length - 1].updatedAt]
    );

    sent += rows.length;
    if (rows.length < PUSH_BATCH) return sent;
  }
}

/** Take everything the server has that is newer than what we have seen. */
async function pull(): Promise<number> {
  const db = getDb();
  let cursor = await getSetting(CURSOR_KEY);
  let applied = 0;

  for (;;) {
    let query = getSupabase()
      .from('memories')
      .select('*')
      .order('updated_at', { ascending: true })
      .limit(PULL_BATCH);
    if (cursor) query = query.gt('updated_at', cursor);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as RemoteRow[];
    if (rows.length === 0) return applied;

    for (const remote of rows) {
      const local = await db.getFirstAsync<{ updatedAt: string }>(
        'SELECT updated_at AS updatedAt FROM memories WHERE id = ?',
        [remote.id]
      );
      if (!shouldApplyRemote(local?.updatedAt ?? null, remote.updated_at)) continue;

      const row = toLocal(remote);
      await db.runAsync(
        `INSERT INTO memories (
           id, raw_input, title, type, category, event_date, date_expression,
           created_at, amount, currency, people, location, tags, priority,
           status, confirmed, repeat, updated_at, deleted, dirty
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)
         ON CONFLICT(id) DO UPDATE SET
           raw_input = excluded.raw_input, title = excluded.title,
           type = excluded.type, category = excluded.category,
           event_date = excluded.event_date,
           date_expression = excluded.date_expression,
           created_at = excluded.created_at, amount = excluded.amount,
           currency = excluded.currency, people = excluded.people,
           location = excluded.location, tags = excluded.tags,
           priority = excluded.priority, status = excluded.status,
           confirmed = excluded.confirmed, repeat = excluded.repeat,
           updated_at = excluded.updated_at,
           deleted = excluded.deleted, dirty = 0`,
        [
          row.id, row.rawInput, row.title, row.type, row.category, row.eventDate,
          row.dateExpression, row.createdAt, row.amount, row.currency, row.people,
          row.location, row.tags, row.priority, row.status, row.confirmed ? 1 : 0,
          row.repeat, row.updatedAt, row.deleted ? 1 : 0,
        ]
      );
      applied += 1;
    }

    cursor = nextCursor(rows, cursor);
    await setSetting(CURSOR_KEY, cursor);
    if (rows.length < PULL_BATCH) return applied;
  }
}

/** Old tombstones have done their job once they have been sent. */
async function purgeTombstones(): Promise<void> {
  const cutoff = new Date(Date.now() - TOMBSTONE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await getDb().runAsync(
    'DELETE FROM memories WHERE deleted = 1 AND dirty = 0 AND updated_at < ?',
    [cutoff]
  );
}

export interface SyncOutcome {
  pushed: number;
  pulled: number;
}

let running: Promise<SyncOutcome | null> | null = null;

/**
 * Push what changed here, then take what changed there.
 *
 * Push first so a local delete reaches the server before its older copy could
 * be pulled back. Only one run at a time: the triggers overlap (launch, a
 * write, the timer, coming back to the app) and two runs would fight.
 *
 * Returns null when there is nothing to do — no project configured, or not
 * signed in. Anything else throws, and the caller shows it.
 */
export function syncNow(): Promise<SyncOutcome | null> {
  if (running) return running;

  running = (async () => {
    if (!isConfigured()) return null;
    const userId = await currentUserId();
    if (!userId) return null;

    const pushed = await push(userId);
    const pulled = await pull();
    await purgeTombstones();
    await setSetting(LAST_SYNC_KEY, new Date().toISOString());
    return { pushed, pulled };
  })().finally(() => {
    running = null;
  });

  return running;
}
