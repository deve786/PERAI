import type * as SQLite from 'expo-sqlite';
import { getDb, getSetting, setSetting } from '../db';
import { currentUserId, getSupabase, isConfigured } from './client';
import { TABLES, type TableDef } from './tables';

const LAST_SYNC_KEY = 'sync.lastAt';
const PUSH_BATCH = 200;
const PULL_BATCH = 500;
/** How long a deleted entry is kept around after the server has been told. */
const TOMBSTONE_DAYS = 30;

const time = (iso: string | null | undefined): number => {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

/**
 * Should the copy from the server replace what is on the phone?
 *
 * Newest wins, and a tie keeps what is already here. A row the phone has
 * never seen (no local copy at all) always applies.
 */
function shouldApplyRemote(localUpdatedAt: string | null | undefined, remoteUpdatedAt: string): boolean {
  if (!localUpdatedAt) return true;
  return time(remoteUpdatedAt) > time(localUpdatedAt);
}

/** How far the pull has now read — only ever moves forward. */
function nextCursor(rows: { updated_at: string }[], current: string): string {
  let latest = current;
  for (const row of rows) {
    if (time(row.updated_at) > time(latest)) latest = row.updated_at;
  }
  return latest;
}

export async function pendingCount(): Promise<number> {
  const db = await getDb();
  let total = 0;
  for (const def of TABLES) {
    const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${def.name} WHERE dirty = 1`);
    total += row?.n ?? 0;
  }
  return total;
}

export async function lastSyncedAt(): Promise<string | null> {
  const v = await getSetting(LAST_SYNC_KEY, '');
  return v || null;
}

/** Send everything changed in this table since the last successful push. */
async function pushTable(db: SQLite.SQLiteDatabase, userId: string, def: TableDef): Promise<number> {
  const selectCols = ['id', ...def.columns, 'updated_at', 'deleted'].join(', ');
  let sent = 0;

  for (;;) {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT ${selectCols} FROM ${def.name} WHERE dirty = 1 ORDER BY updated_at ASC LIMIT ?`,
      [PUSH_BATCH]
    );
    if (rows.length === 0) return sent;

    const payload = rows.map((row) => {
      const out: Record<string, unknown> = {
        id: row.id,
        user_id: userId,
        updated_at: row.updated_at,
        deleted: row.deleted === 1,
      };
      for (const col of def.columns) out[col] = row[col];
      return out;
    });
    const { error } = await getSupabase().from(def.name).upsert(payload, { onConflict: 'id' });
    if (error) throw new Error(`${def.name}: ${error.message}`);

    // Only clear the flag on rows that have not changed again while in flight.
    const ids = rows.map((row) => row.id as string);
    const placeholders = ids.map(() => '?').join(',');
    const lastUpdatedAt = rows[rows.length - 1].updated_at as string;
    await db.runAsync(
      `UPDATE ${def.name} SET dirty = 0 WHERE id IN (${placeholders}) AND updated_at <= ?`,
      [...ids, lastUpdatedAt]
    );

    sent += rows.length;
    if (rows.length < PUSH_BATCH) return sent;
  }
}

/** Take everything the server has in this table that is newer than what we have seen. */
async function pullTable(db: SQLite.SQLiteDatabase, def: TableDef): Promise<number> {
  const cursorKey = `sync.cursor.${def.name}`;
  let cursor = await getSetting(cursorKey, '');
  const allCols = ['id', ...def.columns, 'updated_at', 'deleted'];
  let applied = 0;

  for (;;) {
    let query = getSupabase()
      .from(def.name)
      .select(allCols.join(', '))
      .order('updated_at', { ascending: true })
      .limit(PULL_BATCH);
    if (cursor) query = query.gt('updated_at', cursor);

    const { data, error } = await query;
    if (error) throw new Error(`${def.name}: ${error.message}`);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    if (rows.length === 0) return applied;

    for (const remote of rows) {
      const remoteId = remote.id as string;
      const remoteUpdatedAt = remote.updated_at as string;
      const local = await db.getFirstAsync<{ updated_at: string }>(
        `SELECT updated_at FROM ${def.name} WHERE id = ?`,
        [remoteId]
      );
      if (!shouldApplyRemote(local?.updated_at, remoteUpdatedAt)) continue;

      const values = allCols.map((col) => {
        if (col === 'deleted') return remote.deleted ? 1 : 0;
        if (def.numeric.includes(col)) return Number(remote[col]);
        return remote[col] as string | number | null;
      });
      const insertCols = [...allCols, 'dirty'].join(', ');
      const placeholders = allCols.map(() => '?').join(', ');
      const updateSet = allCols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ');

      await db.runAsync(
        `INSERT INTO ${def.name} (${insertCols}) VALUES (${placeholders}, 0)
         ON CONFLICT(id) DO UPDATE SET ${updateSet}, dirty = 0`,
        values
      );
      applied += 1;
    }

    cursor = nextCursor(rows as { updated_at: string }[], cursor);
    await setSetting(cursorKey, cursor);
    if (rows.length < PULL_BATCH) return applied;
  }
}

/**
 * Tables whose rows are also unique by name per user (enforced locally by a
 * partial unique index, and on the server by categories_user_name_idx /
 * income_categories_user_name_idx) — on top of being unique by id.
 *
 * A fresh install seeds its own "Food", "Transport", etc. with locally
 * generated ids before anyone signs in. Signing into an account that already
 * has those same names (from an earlier device) makes the ordinary push
 * collide: the local row's id is new, so onConflict: 'id' does an INSERT
 * rather than an UPDATE, and the server's name-uniqueness index then rejects
 * it as a duplicate.
 */
const NAME_UNIQUE_TABLES: { name: string; referencedBy: { table: string; column: string }[] }[] = [
  { name: 'categories', referencedBy: [{ table: 'expenses', column: 'category_id' }, { table: 'recurring', column: 'category_id' }] },
  { name: 'income_categories', referencedBy: [{ table: 'income', column: 'category_id' }] },
];

/**
 * Before the ordinary push, fold any locally-seeded row into the server's
 * existing row of the same name: repoint what referenced the local row onto
 * the server's id, then drop the local row outright (never pushed, so no
 * tombstone is needed — just like it never existed).
 */
async function reconcileNamedDuplicates(db: SQLite.SQLiteDatabase, userId: string): Promise<void> {
  const now = new Date().toISOString();
  for (const { name, referencedBy } of NAME_UNIQUE_TABLES) {
    const dirty = await db.getAllAsync<{ id: string; name: string }>(
      `SELECT id, name FROM ${name} WHERE dirty = 1 AND deleted = 0`
    );
    for (const row of dirty) {
      const { data, error } = await getSupabase()
        .from(name)
        .select('id')
        .eq('user_id', userId)
        .eq('name', row.name)
        .neq('id', row.id)
        .limit(1);
      if (error) throw new Error(`${name}: ${error.message}`);
      const remoteId = data?.[0]?.id as string | undefined;
      if (!remoteId) continue;

      for (const ref of referencedBy) {
        await db.runAsync(
          `UPDATE ${ref.table} SET ${ref.column} = ?, updated_at = ?, dirty = 1 WHERE ${ref.column} = ?`,
          [remoteId, now, row.id]
        );
      }
      await db.runAsync(`DELETE FROM ${name} WHERE id = ?`, [row.id]);
    }
  }
}

/** Old tombstones have done their job once they have been sent. */
async function purgeTombstones(db: SQLite.SQLiteDatabase): Promise<void> {
  const cutoff = new Date(Date.now() - TOMBSTONE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  for (const def of TABLES) {
    await db.runAsync(
      `DELETE FROM ${def.name} WHERE deleted = 1 AND dirty = 0 AND updated_at < ?`,
      [cutoff]
    );
  }
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

    const db = await getDb();
    await reconcileNamedDuplicates(db, userId);
    let pushed = 0;
    for (const def of TABLES) pushed += await pushTable(db, userId, def);
    let pulled = 0;
    for (const def of TABLES) pulled += await pullTable(db, def);
    await purgeTombstones(db);
    await setSetting(LAST_SYNC_KEY, new Date().toISOString());
    return { pushed, pulled };
  })().finally(() => {
    running = null;
  });

  return running;
}
