import { getDb, toMemory, type RawRow } from './client';
import { spellingKey, type Spelling } from '../dictionary';
import type { PendingNote } from '../pendingNotes';
import type { Category, Memory, MemoryDraft, MemoryType, Status } from '../types';

/** RFC4122-ish v4 id. Avoids pulling in a uuid package for one call site. */
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Every SELECT goes through this list so callers always get camelCase keys
 * matching the Memory type, instead of the table's snake_case columns.
 */
const COLUMNS = `
  id,
  raw_input        AS rawInput,
  title,
  type,
  category,
  event_date       AS eventDate,
  date_expression  AS dateExpression,
  created_at       AS createdAt,
  amount,
  currency,
  people,
  location,
  tags,
  priority,
  status,
  confirmed
`;

/** Persist a user-confirmed draft. Returns the stored row. */
export async function insertMemory(
  draft: MemoryDraft,
  rawInput: string
): Promise<Memory> {
  const memory: Memory = {
    ...draft,
    id: uuid(),
    rawInput,
    createdAt: new Date().toISOString(),
    confirmed: true,
  };

  await getDb().runAsync(
    `INSERT INTO memories (
       id, raw_input, title, type, category, event_date, date_expression,
       created_at, amount, currency, people, location, tags, priority,
       status, confirmed
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      memory.id,
      memory.rawInput,
      memory.title,
      memory.type,
      memory.category,
      memory.eventDate,
      memory.dateExpression,
      memory.createdAt,
      memory.amount,
      memory.currency,
      memory.people,
      memory.location,
      memory.tags,
      memory.priority,
      memory.status,
      1,
    ]
  );

  return memory;
}

export interface TimelineFilters {
  category?: Category | null;
  type?: MemoryType | null;
}

/** Confirmed memories, newest event first, optionally filtered. */
export async function getTimeline(
  filters: TimelineFilters = {}
): Promise<Memory[]> {
  const clauses = ['confirmed = 1'];
  const params: (string | number)[] = [];

  if (filters.category) {
    clauses.push('category = ?');
    params.push(filters.category);
  }
  if (filters.type) {
    clauses.push('type = ?');
    params.push(filters.type);
  }

  const rows = await getDb().getAllAsync<RawRow>(
    `SELECT ${COLUMNS} FROM memories
     WHERE ${clauses.join(' AND ')}
     ORDER BY event_date DESC, created_at DESC`,
    params
  );

  return rows.map(toMemory);
}

/** All confirmed memories, newest first. */
export function getAllMemories(): Promise<Memory[]> {
  return getTimeline();
}

/** Confirmed memories whose event falls inside an ISO range (inclusive). */
export async function getMemoriesInRange(
  fromISO: string,
  toISO: string
): Promise<Memory[]> {
  const rows = await getDb().getAllAsync<RawRow>(
    `SELECT ${COLUMNS} FROM memories
     WHERE confirmed = 1 AND event_date >= ? AND event_date <= ?
     ORDER BY event_date DESC`,
    [fromISO, toISO]
  );
  return rows.map(toMemory);
}

export async function countMemories(): Promise<number> {
  const row = await getDb().getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM memories WHERE confirmed = 1'
  );
  return row?.n ?? 0;
}

/** Tick a list item off, or put it back. */
export async function setMemoryStatus(id: string, status: Status): Promise<void> {
  await getDb().runAsync('UPDATE memories SET status = ? WHERE id = ?', [status, id]);
}

export async function deleteMemory(id: string): Promise<void> {
  await getDb().runAsync('DELETE FROM memories WHERE id = ?', [id]);
}

/** Remove several entries at once — used by Undo right after saving. */
export async function deleteMemories(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  await getDb().runAsync(`DELETE FROM memories WHERE id IN (${placeholders})`, ids);
}

export async function deleteAllMemories(): Promise<void> {
  await getDb().runAsync('DELETE FROM memories');
}

/** Remember a question for the Ask tab's recent list. */
export async function saveQuestion(text: string): Promise<void> {
  const question = text.trim();
  if (!question) return;
  const db = getDb();
  await db.runAsync(
    `INSERT INTO questions (text, asked_at) VALUES (?, ?)
     ON CONFLICT(text) DO UPDATE SET asked_at = excluded.asked_at`,
    [question, new Date().toISOString()]
  );
  // Keep the table small; only the last few are ever shown.
  await db.runAsync(
    `DELETE FROM questions WHERE text NOT IN
       (SELECT text FROM questions ORDER BY asked_at DESC LIMIT 20)`
  );
}

export async function getRecentQuestions(limit = 5): Promise<string[]> {
  const rows = await getDb().getAllAsync<{ text: string }>(
    'SELECT text FROM questions ORDER BY asked_at DESC LIMIT ?',
    [limit]
  );
  return rows.map((row) => row.text);
}

export async function forgetQuestion(text: string): Promise<void> {
  await getDb().runAsync('DELETE FROM questions WHERE text = ?', [text]);
}

/** Small key/value preference store. Currently just the theme mode. */
export async function getSetting(key: string): Promise<string | null> {
  const row = await getDb().getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [key]
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

/**
 * Remember how a title is really spelled. A correction typed by hand always
 * wins over one found by search, so a name the web cannot know stays fixed.
 */
export async function rememberSpelling(
  heard: string,
  correct: string,
  source: 'user' | 'search'
): Promise<void> {
  const key = spellingKey(heard);
  if (!key || !correct.trim()) return;
  await getDb().runAsync(
    `INSERT INTO spellings (heard, correct, source, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(heard) DO UPDATE SET
       correct = excluded.correct,
       source = excluded.source,
       updated_at = excluded.updated_at
     WHERE excluded.source = 'user' OR spellings.source = 'search'`,
    [key, correct.trim(), source, new Date().toISOString()]
  );
}

export async function getSpellings(limit = 300): Promise<Spelling[]> {
  return getDb().getAllAsync<Spelling>(
    'SELECT heard, correct FROM spellings ORDER BY updated_at DESC LIMIT ?',
    [limit]
  );
}

/** Queue a note the AI could not file yet, so nothing spoken is lost. */
export async function queueNote(text: string, error: string): Promise<void> {
  const note = text.trim();
  if (!note) return;
  const now = new Date().toISOString();
  await getDb().runAsync(
    `INSERT INTO pending_notes (id, text, created_at, attempts, last_attempt_at, last_error)
     VALUES (?, ?, ?, 0, ?, ?)`,
    [uuid(), note, now, now, error]
  );
}

export async function getPendingNotes(): Promise<PendingNote[]> {
  const rows = await getDb().getAllAsync<{
    id: string;
    text: string;
    created_at: string;
    attempts: number;
    last_attempt_at: string | null;
    last_error: string | null;
  }>('SELECT * FROM pending_notes ORDER BY created_at ASC');

  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    createdAt: row.created_at,
    attempts: row.attempts,
    lastAttemptAt: row.last_attempt_at,
    lastError: row.last_error,
  }));
}

/** Record a failed try, so the backoff in pendingNotes.ts can space the next one. */
export async function markNoteTried(id: string, error: string): Promise<void> {
  await getDb().runAsync(
    `UPDATE pending_notes
       SET attempts = attempts + 1, last_attempt_at = ?, last_error = ?
     WHERE id = ?`,
    [new Date().toISOString(), error, id]
  );
}

export async function dropPendingNote(id: string): Promise<void> {
  await getDb().runAsync('DELETE FROM pending_notes WHERE id = ?', [id]);
}
