import { getDb, toMemory, type RawRow } from './client';
import type { Category, Memory, MemoryDraft, MemoryType } from '../types';

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

export async function deleteMemory(id: string): Promise<void> {
  await getDb().runAsync('DELETE FROM memories WHERE id = ?', [id]);
}

export async function deleteAllMemories(): Promise<void> {
  await getDb().runAsync('DELETE FROM memories');
}
