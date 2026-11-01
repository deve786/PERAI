import { getDb, initDatabase } from './db/client';
import { uuid } from './expense/db';
import { UNSORTED, type Note } from './notesLogic';

export type { Note } from './notesLogic';

/** Kept on this phone, in the same database as the rest of your record. */
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'Other',
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_notes_category ON notes (category);
`;

async function ready() {
  await initDatabase();
  const db = getDb();
  await db.execAsync(SCHEMA_SQL);
  return db;
}

export async function listNotes(): Promise<Note[]> {
  const db = await ready();
  return db.getAllAsync<Note>('SELECT * FROM notes ORDER BY updated_at DESC');
}

export async function saveNote(input: {
  id?: string | null;
  title: string;
  body: string;
  category: string;
  pinned?: boolean;
}): Promise<string> {
  const db = await ready();
  const now = new Date().toISOString();
  const id = input.id || uuid();
  await db.runAsync(
    `INSERT INTO notes (id, title, body, category, pinned, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title, body = excluded.body, category = excluded.category,
       pinned = excluded.pinned, updated_at = excluded.updated_at`,
    id,
    input.title.trim(),
    input.body.trim(),
    input.category.trim() || UNSORTED,
    input.pinned ? 1 : 0,
    now,
    now
  );
  return id;
}

export async function deleteNote(id: string): Promise<void> {
  const db = await ready();
  await db.runAsync('DELETE FROM notes WHERE id = ?', id);
}
