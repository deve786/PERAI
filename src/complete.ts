import { logOk } from './log';
import { setMemoryStatus, updateMemory } from './db/queries';
import { nextOccurrence } from './repeat';
import type { Memory } from './types';

/**
 * Tick an entry off — or, when it repeats, move it to its next turn.
 *
 * "Gym every Monday" is never finished; ticking it means this Monday is done.
 * Closing it would mean saying it again next week, which is the friction
 * repeating exists to remove. One place for the rule, because the Timeline,
 * the Today screen, the Lists tab and the reminder's own Done button all need
 * to behave the same.
 */
export async function completeMemory(memory: Memory, now: Date = new Date()): Promise<void> {
  if (memory.repeat) {
    const next = nextOccurrence(memory.eventDate, memory.repeat, now);
    await updateMemory(memory.id, { eventDate: next, status: 'active' });
    logOk('Done — comes round again', `${memory.title} · ${new Date(next).toDateString()}`);
    return;
  }

  await setMemoryStatus(memory.id, 'done');
  logOk('Ticked off', memory.title);
}

/** Put a struck entry back. A repeating one is already active, so this is a no-op. */
export async function reopenMemory(memory: Memory): Promise<void> {
  if (memory.status === 'active') return;
  await setMemoryStatus(memory.id, 'active');
  logOk('Put back', memory.title);
}

/** Move an entry on by whole days, keeping its time of day. */
export async function pushMemory(memory: Memory, days: number): Promise<string> {
  const when = new Date(memory.eventDate);
  when.setDate(when.getDate() + days);
  await updateMemory(memory.id, { eventDate: when.toISOString() });
  logOk(days === 1 ? 'Pushed to tomorrow' : `Pushed on ${days} days`, memory.title);
  return when.toISOString();
}
