import { dayKey, dayLabel, hasStatedTime, timeLabel } from '../format';
import type { Memory, MemoryType, Priority } from '../types';

/** Only things still to act on belong on the home screen. */
export const WIDGET_TYPES: readonly MemoryType[] = ['task', 'reminder', 'appointment'];
export const WIDGET_LIMIT = 8;

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
const rank = (priority: Priority | null) => (priority ? PRIORITY_RANK[priority] : 3);

export interface WidgetItem {
  id: string;
  title: string;
  priority: Priority | null;
  /** "Tomorrow 16:00", "Today", or null when no date was ever given. */
  when: string | null;
}

export interface WidgetData {
  items: WidgetItem[];
  /** Everything open, including what didn't fit under the limit. */
  total: number;
}

function whenLabel(memory: Memory, now: Date): string | null {
  // A task saved as "buy milk" still gets a timestamp from the model; showing
  // it would invent a due date nobody gave.
  if (memory.type === 'task' && !memory.dateExpression) return null;
  const day = dayLabel(memory.eventDate, now);
  return hasStatedTime(memory.dateExpression) ? `${day} ${timeLabel(memory.eventDate)}` : day;
}

/**
 * Open tasks, reminders and appointments, most important first, then soonest.
 * A reminder or appointment from an earlier day has passed and is dropped; a
 * task stays until it's done, however old.
 */
export function widgetItems(
  memories: Memory[],
  now: Date = new Date(),
  limit: number = WIDGET_LIMIT
): WidgetData {
  const today = dayKey(now.toISOString());
  const open = memories
    .filter((m) => m.status === 'active' && WIDGET_TYPES.includes(m.type))
    .filter((m) => m.type === 'task' || dayKey(m.eventDate) >= today)
    .sort(
      (a, b) =>
        rank(a.priority) - rank(b.priority) || a.eventDate.localeCompare(b.eventDate)
    );

  return {
    total: open.length,
    items: open.slice(0, limit).map((m) => ({
      id: m.id,
      title: m.title,
      priority: m.priority,
      when: whenLabel(m, now),
    })),
  };
}
