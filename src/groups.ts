/**
 * Groups: several entries kept together under one name — "Kozhikode trip",
 * "Work", "House move" — so a job made of many small tasks reads as one thing
 * with a finish line instead of a scatter across the timeline.
 *
 * A group is just a name on an entry. There is no groups table: naming one on
 * an entry creates it, and the last entry leaving takes it away, which means a
 * group can never fall out of step with its contents.
 *
 * Pure, so it is unit tested in plain Node. Storage lives in src/db/queries.ts.
 */
import type { Memory } from './types';

/**
 * One name for one group, however it was typed.
 *
 * Spacing and case are tidied but the words are kept as written — "kozhikode
 * trip" said twice should land in one group, while "Kozhikode Trip" stays
 * capitalised the way the person wrote it.
 */
export function normalizeGroupName(name: string | null | undefined): string | null {
  const clean = (name ?? '').replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, 60) : null;
}

/** Two names are the same group when they match apart from case. */
export function sameGroup(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

/** No more than this from one line, so a stray paste cannot flood a group. */
export const MAX_TASKS_AT_ONCE = 25;

/**
 * Several tasks out of one line: "book tickets, pack bags, get cash".
 *
 * Split on the marks people actually use for a list — new lines, commas,
 * semicolons — and on "and" only when nothing else separated them, so "fish
 * and chips" typed on its own stays one thing while "book tickets and pack
 * bags" becomes two.
 */
export function splitTasks(text: string): string[] {
  const parts = text
    .split(/[\n;,]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const pieces =
    parts.length === 1
      ? parts[0]
          .split(/\s+(?:and|&)\s+/i)
          .map((part) => part.trim())
          .filter(Boolean)
      : parts;

  const seen = new Set<string>();
  const tasks: string[] = [];
  for (const piece of pieces) {
    const task = piece.replace(/\s+/g, ' ').slice(0, 200);
    const key = task.toLowerCase();
    if (!task || seen.has(key)) continue;
    seen.add(key);
    tasks.push(task);
    if (tasks.length >= MAX_TASKS_AT_ONCE) break;
  }
  return tasks;
}

export interface GroupSummary {
  name: string;
  /** Everything in it, newest work first — see `membersOf` for the order. */
  total: number;
  done: number;
  open: number;
  /** When the next unfinished one is due, or null when nothing is left. */
  nextDue: string | null;
  /** Unfinished and already past. */
  overdue: number;
  /** 0–1, for the progress bar. 1 when a group is finished. */
  progress: number;
}

/**
 * Every group in the record, the ones with work left first.
 *
 * Ordered the way they need attention: anything overdue, then whatever is due
 * soonest, then finished groups last, so a trip that is over sinks below the
 * one being planned.
 */
export function groupSummaries(
  memories: Memory[],
  now: Date = new Date(),
  /** Groups made on their own, before anything has been put in them. */
  empty: string[] = []
): GroupSummary[] {
  const byKey = new Map<string, { name: string; items: Memory[] }>();

  // Named first so a group made deliberately keeps the spelling it was given,
  // even once entries arrive under a different capitalisation.
  for (const name of empty) {
    const clean = normalizeGroupName(name);
    if (clean && !byKey.has(clean.toLowerCase())) {
      byKey.set(clean.toLowerCase(), { name: clean, items: [] });
    }
  }

  for (const memory of memories) {
    const name = normalizeGroupName(memory.groupName);
    if (!name) continue;
    const key = name.toLowerCase();
    const existing = byKey.get(key);
    if (existing) existing.items.push(memory);
    // The first spelling seen wins, so one group does not appear twice.
    else byKey.set(key, { name, items: [memory] });
  }

  const summaries = [...byKey.values()].map(({ name, items }) => {
    const open = items.filter((memory) => memory.status === 'active');
    const due = open
      .map((memory) => memory.eventDate)
      .sort((a, b) => a.localeCompare(b))
      .at(0) ?? null;

    return {
      name,
      total: items.length,
      done: items.length - open.length,
      open: open.length,
      nextDue: due,
      overdue: open.filter((memory) => new Date(memory.eventDate).getTime() < now.getTime()).length,
      progress: items.length === 0 ? 0 : (items.length - open.length) / items.length,
    };
  });

  // A group with nothing in it yet is waiting, not finished: it was just made
  // and needs filling, so it sits with the live ones rather than at the end.
  const finished = (group: GroupSummary) => group.total > 0 && group.open === 0;

  return summaries.sort((a, b) => {
    if (finished(a) !== finished(b)) return finished(a) ? 1 : -1;
    if (a.overdue !== b.overdue) return b.overdue - a.overdue;
    if (a.nextDue && b.nextDue) return a.nextDue.localeCompare(b.nextDue);
    return a.name.localeCompare(b.name);
  });
}

/**
 * What is in one group: unfinished first in date order, then what is done,
 * most recently finished first — the same reading order as the lists.
 */
export function membersOf(memories: Memory[], name: string): Memory[] {
  const mine = memories.filter((memory) => sameGroup(normalizeGroupName(memory.groupName), name));
  const open = mine
    .filter((memory) => memory.status === 'active')
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  const done = mine
    .filter((memory) => memory.status !== 'active')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return [...open, ...done];
}

/** Every group that exists, for the pickers — including the empty ones. */
export function groupNames(memories: Memory[], empty: string[] = []): string[] {
  return groupSummaries(memories, new Date(), empty).map((group) => group.name);
}
