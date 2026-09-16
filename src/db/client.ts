import * as SQLite from 'expo-sqlite';
import { CREATE_TABLE_SQL, DATABASE_NAME } from './schema';
import type { Category, Memory, MemoryType, Priority, Status } from '../types';

/**
 * The whole data layer is async.
 *
 * expo-sqlite's synchronous API blocks the calling thread via `Atomics.wait`,
 * which browsers forbid on the main thread — on web every sync call fails with
 * "Sync operation timeout" no matter when it runs. The async API works on both
 * native and web, so it is the only single-code-path option.
 *
 * This is also why the app does not use Drizzle: `drizzle-orm/expo-sqlite` is a
 * sync-only driver, so it cannot run on web at all.
 */
let database: SQLite.SQLiteDatabase | null = null;
let opening: Promise<SQLite.SQLiteDatabase> | null = null;

/** Idempotent — concurrent callers share one open. */
export function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!opening) {
    opening = (async () => {
      // `enableChangeListener` powers addDatabaseChangeListener, which is what
      // lets the Timeline refresh itself after a memory is confirmed.
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME, {
        enableChangeListener: true,
      });
      await db.execAsync(CREATE_TABLE_SQL);
      database = db;
      return db;
    })().catch((err) => {
      // Allow a later retry rather than caching the failure forever.
      opening = null;
      throw err;
    });
  }
  return opening;
}

export function getDb(): SQLite.SQLiteDatabase {
  if (!database) {
    throw new Error('Database not initialised — await initDatabase() first.');
  }
  return database;
}

/** Subscribe to writes. Returns an unsubscribe function. */
export function onDatabaseChange(listener: () => void): () => void {
  const subscription = SQLite.addDatabaseChangeListener(() => listener());
  return () => subscription.remove();
}

/** Shape returned by every SELECT below (snake_case aliased to camelCase). */
export interface RawRow {
  id: string;
  rawInput: string;
  title: string;
  type: string;
  category: string;
  eventDate: string;
  dateExpression: string | null;
  createdAt: string;
  amount: number | null;
  currency: string | null;
  people: string | null;
  location: string | null;
  tags: string | null;
  priority: string | null;
  status: string;
  confirmed: number;
}

/** Widen a raw row into the app's domain type. */
export function toMemory(row: RawRow): Memory {
  return {
    ...row,
    type: row.type as MemoryType,
    category: row.category as Category,
    priority: (row.priority as Priority | null) ?? null,
    status: row.status as Status,
    confirmed: row.confirmed === 1,
  };
}
