/**
 * The shape of a row on the server, and the rules for deciding what wins.
 *
 * Pure, so the awkward parts — which copy is newer, how far the cursor has
 * moved — are unit tested in plain Node rather than against a live project.
 */
import type { Category, Memory, MemoryType, Priority, Repeat, Status } from '../types';

/** One row of public.memories, as supabase-js hands it over. */
export interface RemoteRow {
  id: string;
  raw_input: string;
  title: string;
  type: string;
  category: string;
  event_date: string;
  date_expression: string | null;
  created_at: string;
  amount: number | null;
  currency: string | null;
  people: string | null;
  location: string | null;
  tags: string | null;
  priority: string | null;
  status: string;
  confirmed: boolean;
  repeat: string | null;
  end_date: string | null;
  group_name: string | null;
  deleted: boolean;
  updated_at: string;
}

/** A local row, including the one column the app's Memory type does not carry. */
export interface LocalRow extends Memory {
  deleted: boolean;
}

export function toRemote(row: LocalRow): Omit<RemoteRow, 'updated_at'> {
  return {
    id: row.id,
    raw_input: row.rawInput,
    title: row.title,
    type: row.type,
    category: row.category,
    event_date: row.eventDate,
    date_expression: row.dateExpression,
    created_at: row.createdAt,
    amount: row.amount,
    currency: row.currency,
    people: row.people,
    location: row.location,
    tags: row.tags,
    priority: row.priority,
    status: row.status,
    confirmed: row.confirmed,
    repeat: row.repeat,
    end_date: row.endDate,
    group_name: row.groupName,
    deleted: row.deleted,
  };
}

export function toLocal(row: RemoteRow): LocalRow {
  return {
    id: row.id,
    rawInput: row.raw_input,
    title: row.title,
    type: row.type as MemoryType,
    category: row.category as Category,
    eventDate: row.event_date,
    dateExpression: row.date_expression,
    createdAt: row.created_at,
    amount: row.amount,
    currency: row.currency,
    people: row.people,
    location: row.location,
    tags: row.tags,
    priority: row.priority as Priority | null,
    status: row.status as Status,
    confirmed: row.confirmed,
    repeat: (row.repeat as Repeat | null) ?? null,
    endDate: row.end_date,
    groupName: row.group_name,
    updatedAt: row.updated_at,
    deleted: row.deleted,
  };
}

const time = (iso: string | null | undefined): number => {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

/**
 * Should the copy from the server replace what is on the phone?
 *
 * Newest wins, and a tie keeps what is already here — with one device that is
 * the same row anyway, and it stops an unchanged row being rewritten on every
 * sync. A row the phone has never seen always applies.
 */
export function shouldApplyRemote(
  localUpdatedAt: string | null,
  remoteUpdatedAt: string
): boolean {
  if (localUpdatedAt === null) return true;
  return time(remoteUpdatedAt) > time(localUpdatedAt);
}

/**
 * How far the pull has now read. The next pull asks for anything after this,
 * so it only ever moves forward, and never past a row that was not applied.
 */
export function nextCursor(rows: { updated_at: string }[], current: string | null): string {
  let latest = current ?? '';
  for (const row of rows) {
    if (time(row.updated_at) > time(latest)) latest = row.updated_at;
  }
  return latest;
}
