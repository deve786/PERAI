import { getDb, toMemory, type RawRow } from './client';
import { unlinkAllForMemory } from '../expense/db';
import { logFail } from '../log';
import { spellingKey, type Spelling } from '../dictionary';
import { backoffFor, type PendingNote, type PendingTitle } from '../pendingNotes';
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
  confirmed,
  repeat,
  end_date         AS endDate,
  group_name       AS groupName,
  updated_at       AS updatedAt
`;

/** Persist a user-confirmed draft. Returns the stored row. */
export async function insertMemory(
  draft: MemoryDraft,
  rawInput: string
): Promise<Memory> {
  const createdAt = new Date().toISOString();
  const memory: Memory = {
    ...draft,
    id: uuid(),
    rawInput,
    createdAt,
    confirmed: true,
    endDate: null,
    updatedAt: createdAt,
  };

  await getDb().runAsync(
    `INSERT INTO memories (
       id, raw_input, title, type, category, event_date, date_expression,
       created_at, amount, currency, people, location, tags, priority,
       status, confirmed, repeat, end_date, group_name, updated_at, deleted, dirty
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,1)`,
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
      memory.repeat,
      memory.endDate,
      memory.groupName,
      memory.updatedAt,
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
  const clauses = ['confirmed = 1', 'deleted = 0'];
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
     WHERE confirmed = 1 AND deleted = 0 AND event_date >= ? AND event_date <= ?
     ORDER BY event_date DESC`,
    [fromISO, toISO]
  );
  return rows.map(toMemory);
}

export async function countMemories(): Promise<number> {
  const row = await getDb().getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM memories WHERE confirmed = 1 AND deleted = 0'
  );
  return row?.n ?? 0;
}

/** Rename an entry — used when a web search confirms a title's spelling. */
export async function updateMemoryTitle(id: string, title: string): Promise<void> {
  await getDb().runAsync(
    'UPDATE memories SET title = ?, updated_at = ?, dirty = 1 WHERE id = ?',
    [title, new Date().toISOString(), id]
  );
}

/** Tick a list item off, or put it back. */
export async function setMemoryStatus(id: string, status: Status): Promise<void> {
  await getDb().runAsync(
    'UPDATE memories SET status = ?, updated_at = ?, dirty = 1 WHERE id = ?',
    [status, new Date().toISOString(), id]
  );
}

/**
 * Deleting marks the row deleted rather than removing it.
 *
 * The row has to outlive the delete long enough for the server to hear about
 * it; a row that simply vanished here would be handed back on the next pull.
 * Sync clears old tombstones once they have been sent.
 */
export async function deleteMemory(id: string): Promise<void> {
  await deleteMemories([id]);
}

/** Remove several entries at once — used by Undo right after saving. */
export async function deleteMemories(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  await getDb().runAsync(
    `UPDATE memories SET deleted = 1, updated_at = ?, dirty = 1
     WHERE id IN (${placeholders})`,
    [new Date().toISOString(), ...ids]
  );

  // Any spending tied to these entries loses its tie. That table lives in the
  // expense database, so it is a separate call rather than a foreign key, and
  // it must not take the delete down with it if the other zone is unavailable.
  for (const id of ids) {
    await unlinkAllForMemory(id).catch((err: unknown) => {
      logFail(
        'Could not unlink spending from a deleted entry',
        err instanceof Error ? err.message : String(err)
      );
    });
  }
}

export async function deleteAllMemories(): Promise<void> {
  await getDb().runAsync('UPDATE memories SET deleted = 1, updated_at = ?, dirty = 1', [
    new Date().toISOString(),
  ]);
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
 * Groups made before anything is in them.
 *
 * A group is otherwise just a name carried by its entries, which is what keeps
 * it from ever disagreeing with its contents — but a group has to be able to
 * exist for the moment between making it and filling it. Those names are kept
 * here until an entry carries them.
 */
const EMPTY_GROUPS_KEY = 'groups.empty';

export async function getEmptyGroups(): Promise<string[]> {
  const stored = await getSetting(EMPTY_GROUPS_KEY);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === 'string') : [];
  } catch {
    // A corrupted value is worth no more than an empty list.
    return [];
  }
}

export async function addEmptyGroup(name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) return;
  const current = await getEmptyGroups();
  if (current.some((existing) => existing.toLowerCase() === clean.toLowerCase())) return;
  await setSetting(EMPTY_GROUPS_KEY, JSON.stringify([...current, clean]));
}

export async function removeEmptyGroup(name: string): Promise<void> {
  const current = await getEmptyGroups();
  const next = current.filter((existing) => existing.toLowerCase() !== name.trim().toLowerCase());
  if (next.length !== current.length) await setSetting(EMPTY_GROUPS_KEY, JSON.stringify(next));
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

/**
 * Line a title up to be checked against a web search.
 *
 * Kept in the database rather than in memory, so a search that takes a minute
 * is not lost when the app is closed, and so the screen can show what is still
 * being checked while you carry on adding.
 */
export async function queueTitleCheck(
  id: string,
  title: string,
  type: MemoryType
): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO pending_titles (id, title, type, created_at, attempts, last_attempt_at, last_error)
     VALUES (?, ?, ?, ?, 0, NULL, NULL)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, attempts = 0, last_attempt_at = NULL`,
    [id, title, type, new Date().toISOString()]
  );
}

export async function getPendingTitles(): Promise<PendingTitle[]> {
  const rows = await getDb().getAllAsync<{
    id: string;
    title: string;
    type: string;
    created_at: string;
    attempts: number;
    last_attempt_at: string | null;
    last_error: string | null;
  }>('SELECT * FROM pending_titles ORDER BY created_at ASC');

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type as MemoryType,
    createdAt: row.created_at,
    attempts: row.attempts,
    lastAttemptAt: row.last_attempt_at,
    lastError: row.last_error,
  }));
}

/**
 * Hold a title back until a given moment, without spending one of its tries.
 *
 * Used when the AI has simply run out for the day: the wait is hours, not the
 * minutes the ordinary backoff deals in, and it would otherwise use up every
 * attempt against a wall and give up before the quota ever returned. The
 * pretend "last attempt" is placed so the ordinary backoff makes it due
 * exactly when the quota comes back.
 */
export async function deferTitleCheck(
  id: string,
  notBefore: Date,
  reason: string
): Promise<void> {
  const pretendLastTry = new Date(notBefore.getTime() - backoffFor(0)).toISOString();
  await getDb().runAsync(
    'UPDATE pending_titles SET last_attempt_at = ?, last_error = ? WHERE id = ?',
    [pretendLastTry, reason, id]
  );
}

export async function markTitleTried(id: string, error: string): Promise<void> {
  await getDb().runAsync(
    `UPDATE pending_titles
       SET attempts = attempts + 1, last_attempt_at = ?, last_error = ?
     WHERE id = ?`,
    [new Date().toISOString(), error, id]
  );
}

export async function dropPendingTitle(id: string): Promise<void> {
  await getDb().runAsync('DELETE FROM pending_titles WHERE id = ?', [id]);
}

/** Stop checking everything that is waiting. */
export async function clearPendingTitles(): Promise<void> {
  await getDb().runAsync('DELETE FROM pending_titles');
}

/**
 * Forget titles that have been waiting for days.
 *
 * A name that could not be checked in that time is not going to be, and a
 * list of them sitting on the Record tab for ever is worse than the entry
 * simply keeping the spelling you gave it.
 */
export async function dropStaleTitles(before: Date): Promise<void> {
  await getDb().runAsync('DELETE FROM pending_titles WHERE created_at < ?', [
    before.toISOString(),
  ]);
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
/** As deferTitleCheck, for a note waiting to be filed. */
export async function deferPendingNote(
  id: string,
  notBefore: Date,
  reason: string
): Promise<void> {
  const pretendLastTry = new Date(notBefore.getTime() - backoffFor(0)).toISOString();
  await getDb().runAsync(
    'UPDATE pending_notes SET last_attempt_at = ?, last_error = ? WHERE id = ?',
    [pretendLastTry, reason, id]
  );
}

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

/**
 * Change an entry. Only the fields given are touched.
 *
 * Every write stamps `updated_at` and flags the row, so an edit made here
 * reaches the server like any other change (see src/sync/sync.ts).
 */
export async function updateMemory(
  id: string,
  patch: Partial<
    Pick<
      Memory,
      | 'title'
      | 'type'
      | 'category'
      | 'eventDate'
      | 'dateExpression'
      | 'amount'
      | 'currency'
      | 'people'
      | 'location'
      | 'tags'
      | 'priority'
      | 'status'
      | 'repeat'
      | 'endDate'
      | 'groupName'
    >
  >
): Promise<void> {
  const columns: Record<string, string> = {
    title: 'title',
    type: 'type',
    category: 'category',
    eventDate: 'event_date',
    dateExpression: 'date_expression',
    amount: 'amount',
    currency: 'currency',
    people: 'people',
    location: 'location',
    tags: 'tags',
    priority: 'priority',
    status: 'status',
    repeat: 'repeat',
    groupName: 'group_name',
    endDate: 'end_date',
  };

  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  for (const [field, value] of Object.entries(patch)) {
    const column = columns[field];
    if (!column) continue;
    sets.push(`${column} = ?`);
    values.push(value as string | number | null);
  }
  if (sets.length === 0) return;

  await getDb().runAsync(
    `UPDATE memories SET ${sets.join(', ')}, updated_at = ?, dirty = 1 WHERE id = ?`,
    [...values, new Date().toISOString(), id]
  );
}

/** One entry by id, or null when it has been deleted. */
export async function getMemory(id: string): Promise<Memory | null> {
  const row = await getDb().getFirstAsync<RawRow>(
    `SELECT ${COLUMNS} FROM memories WHERE id = ? AND deleted = 0`,
    [id]
  );
  return row ? toMemory(row) : null;
}
