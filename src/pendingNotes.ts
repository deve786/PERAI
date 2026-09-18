/**
 * When to try filing a note again.
 *
 * A note lands in the pending queue when the AI call fails — usually offline,
 * or the free tier's quota spent for the minute. Pure, so the backoff is unit
 * tested in plain Node; the queue itself lives in src/db/queries.ts.
 */

export interface PendingNote {
  id: string;
  text: string;
  createdAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  lastError: string | null;
}

/** How often the app checks the queue while it is open. */
export const RETRY_TICK_MS = 60_000;
/** Waits between tries: a minute, then longer, capped at an hour. */
export const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
/** Stop retrying by itself after this many tries; the Record tab still offers Retry. */
export const MAX_ATTEMPTS = 8;

export function backoffFor(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
}

/**
 * Is this note due for another try? A note that has never been tried since it
 * was queued is due immediately — the first failure already happened.
 */
export function shouldRetry(note: PendingNote, now: Date = new Date()): boolean {
  if (note.attempts >= MAX_ATTEMPTS) return false;
  if (!note.lastAttemptAt) return true;

  const last = new Date(note.lastAttemptAt).getTime();
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= backoffFor(note.attempts);
}

/** The next note to try, oldest first, or null when none is due. */
export function nextDue(notes: PendingNote[], now: Date = new Date()): PendingNote | null {
  const due = notes
    .filter((note) => shouldRetry(note, now))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return due[0] ?? null;
}
