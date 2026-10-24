/**
 * Database client for multi-source data.
 */
import * as SQLite from 'expo-sqlite';
import { DATABASE_NAME, SOURCES_SCHEMA } from './schema';

let db: SQLite.SQLiteDatabase | null = null;

export async function getSourcesDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL;');
  return db;
}

export async function initSourcesDb(): Promise<void> {
  const database = await getSourcesDb();
  await database.execAsync(SOURCES_SCHEMA);
}

/** RFC4122-ish v4 id */
export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
