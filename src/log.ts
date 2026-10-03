import { getDb } from './db/client';

export type LogLevel = 'ok' | 'fail';

export interface LogEntry {
  id: number;
  at: string;
  level: LogLevel;
  event: string;
  detail: string | null;
}

/** Enough to explain today without turning into a developer trace. */
const KEEP = 200;

/**
 * A short diary of what the app did.
 *
 * Only the things a person would want to read: a note saved, a backup, a name
 * corrected, and anything that failed — with the reason, since "it didn't
 * work" is the one thing the screens cannot always say in place.
 *
 * Writing a line must never break what it is describing, so every call is
 * guarded and failures are dropped.
 */
async function write(level: LogLevel, event: string, detail?: string): Promise<void> {
  try {
    const db = getDb();
    await db.runAsync('INSERT INTO logs (at, level, event, detail) VALUES (?, ?, ?, ?)', [
      new Date().toISOString(),
      level,
      event,
      detail ?? null,
    ]);
    await db.runAsync(
      `DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY id DESC LIMIT ?)`,
      [KEEP]
    );
  } catch {
    // A diary that cannot be written is not worth an error of its own.
  }
}

export function logOk(event: string, detail?: string): void {
  void write('ok', event, detail);
}

export function logFail(event: string, reason: string): void {
  void write('fail', event, reason);
}

export async function recentLogs(limit = KEEP): Promise<LogEntry[]> {
  try {
    return await getDb().getAllAsync<LogEntry>(
      'SELECT id, at, level, event, detail FROM logs ORDER BY id DESC LIMIT ?',
      [limit]
    );
  } catch {
    return [];
  }
}

export async function clearLogs(): Promise<void> {
  try {
    await getDb().runAsync('DELETE FROM logs');
  } catch {
    // Nothing to clear.
  }
}
