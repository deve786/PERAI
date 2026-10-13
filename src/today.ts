/**
 * What to do now: the day's work, in the order it is worth doing.
 *
 * Pure, so the ordering and the cut-offs are unit tested in plain Node. The
 * screen (app/(tabs)/today.tsx) only renders what this returns.
 */
import { dayKey } from './format';
import { dueAt } from './strike';
import type { Memory, MemoryType, Priority } from './types';

/** Only things meant to be done can be on a day's plan. */
const ACTIONABLE: readonly MemoryType[] = ['task', 'reminder', 'appointment'];

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
const rank = (priority: Priority | null) => (priority ? PRIORITY_RANK[priority] : 3);

export interface DayPlan {
  /** Due before today and still open — the first thing you need to see. */
  overdue: Memory[];
  /** Due today, plus anything open that was never given a date. */
  today: Memory[];
  tomorrow: Memory[];
  /** Everything above, for a count in the tab. */
  count: number;
}

/** A time to act on beats one without; after that, the more urgent first. */
function inOrder(a: Memory, b: Memory): number {
  const at = dueAt(a)?.getTime() ?? null;
  const bt = dueAt(b)?.getTime() ?? null;
  if (at !== null && bt !== null && at !== bt) return at - bt;
  if (at !== null && bt === null) return -1;
  if (at === null && bt !== null) return 1;
  return rank(a.priority) - rank(b.priority) || a.createdAt.localeCompare(b.createdAt);
}

export function planDay(memories: Memory[], now: Date = new Date()): DayPlan {
  const today = dayKey(now.toISOString());
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = dayKey(tomorrowDate.toISOString());

  const open = memories.filter(
    (memory) => memory.status === 'active' && ACTIONABLE.includes(memory.type)
  );

  const plan: DayPlan = { overdue: [], today: [], tomorrow: [], count: 0 };

  for (const memory of open) {
    const due = dueAt(memory);
    if (!due) {
      // No date was ever given: it is not late, it is simply still to do.
      plan.today.push(memory);
      continue;
    }

    const day = dayKey(memory.eventDate);
    if (day < today) plan.overdue.push(memory);
    else if (day === today) plan.today.push(memory);
    else if (day === tomorrow) plan.tomorrow.push(memory);
  }

  plan.overdue.sort(inOrder);
  plan.today.sort(inOrder);
  plan.tomorrow.sort(inOrder);
  plan.count = plan.overdue.length + plan.today.length;
  return plan;
}
