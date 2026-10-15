/**
 * What the Ask box is allowed to change, and the rules that decide whether a
 * proposed change is allowed at all.
 *
 * The model only ever proposes. Everything here runs on the phone, before any
 * confirmation card is drawn: unknown ids, unknown kinds, dates in the past
 * and oversized batches are thrown out, and anything ambiguous is turned into
 * a question instead of a guess. Pure, so every one of those rules is unit
 * tested in plain Node; applying the survivors lives in src/ai/command.ts.
 */
import { fullDateLabel, hasStatedTime, timeLabel } from './format';
import { CATEGORIES, PRIORITIES, type Category, type Memory, type Priority } from './types';

/** The only things an instruction may ask for. Anything else is refused. */
export const ACTION_KINDS = [
  'reschedule_entry',
  'mark_done',
  'reopen_entry',
  'change_priority',
  'edit_amount',
  'change_category',
  'add_entry',
  'mark_many_done',
  'delete_entry',
] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];

/** One change as the model proposed it, before anything has been checked. */
export interface ProposedAction {
  kind: string;
  /** An entry id, for everything that works on an entry. */
  entryId?: string | null;
  /** An expense id, for edit_amount and change_category on spending. */
  expenseId?: string | null;
  /** Several entries, for mark_many_done. */
  entryIds?: string[] | null;
  newDate?: string | null;
  newTime?: string | null;
  newPriority?: string | null;
  newAmount?: number | null;
  newCategory?: string | null;
  /** For add_entry: the note to capture, in the person's own words. */
  text?: string | null;
}

/** The parts of an expense row an action needs. An ExpenseRow satisfies this. */
export interface ExpenseTarget {
  id: string;
  amount: number;
  cat_name: string;
  category_id: string;
  note: string;
  date: string;
}

/** A change that passed every check, with the entries it will touch attached. */
export interface ValidAction {
  kind: ActionKind;
  memories: Memory[];
  expenses: ExpenseTarget[];
  newDate?: string;
  newPriority?: Priority;
  newAmount?: number;
  newCategory?: string;
  /** True when the instruction itself gave a clock time for the new date. */
  newTimeStated?: boolean;
  /** For add_entry: what to hand to the review screen. */
  text?: string;
}

export interface ValidationResult {
  actions: ValidAction[];
  /** Why anything was refused, in words that can be shown. */
  refused: string[];
  /** True when the batch was trimmed to the cap. */
  trimmed: boolean;
}

/** No instruction may change more than this at once. */
export const MAX_BATCH = 20;

const isKind = (kind: string): kind is ActionKind =>
  (ACTION_KINDS as readonly string[]).includes(kind);

/**
 * Check what the model proposed against what actually exists.
 *
 * @param candidates the entries and expenses that were sent to the model —
 *        the only things it is allowed to name
 * @param allowPast  the person explicitly asked for a date in the past
 */
export function validateActions(
  proposed: ProposedAction[],
  candidates: { memories: Memory[]; expenses: ExpenseTarget[]; expenseCategories?: string[] },
  now: Date = new Date(),
  allowPast = false
): ValidationResult {
  const memoryById = new Map(candidates.memories.map((memory) => [memory.id, memory]));
  const expenseById = new Map(candidates.expenses.map((expense) => [expense.id, expense]));

  const actions: ValidAction[] = [];
  const refused: string[] = [];
  let touched = 0;
  let trimmed = false;

  for (const item of proposed) {
    if (!isKind(item.kind)) {
      refused.push(`"${item.kind}" is not something this can do.`);
      continue;
    }

    // add_entry never touches an existing row: it becomes a draft for the
    // Preview screen, where it is reviewed like any other capture.
    if (item.kind === 'add_entry') {
      const text = (item.text ?? '').trim();
      if (!text) {
        refused.push('There was nothing to record.');
        continue;
      }
      actions.push({ kind: item.kind, memories: [], expenses: [], text });
      continue;
    }

    const wantedIds =
      item.kind === 'mark_many_done'
        ? (item.entryIds ?? []).filter((id): id is string => typeof id === 'string')
        : [item.entryId].filter((id): id is string => typeof id === 'string');

    const memories = wantedIds.map((id) => memoryById.get(id)).filter((m): m is Memory => !!m);
    const unknownIds = wantedIds.filter((id) => !memoryById.has(id));

    const expense = item.expenseId ? expenseById.get(item.expenseId) : undefined;
    if (item.expenseId && !expense) unknownIds.push(item.expenseId);

    if (unknownIds.length > 0) {
      // The model named something it was never shown. Refusing is the only
      // safe answer: there is no way to know what it meant.
      refused.push(`Could not find what "${item.kind.replace(/_/g, ' ')}" was meant to change.`);
      continue;
    }
    if (memories.length === 0 && !expense) {
      refused.push(`Nothing was named for "${item.kind.replace(/_/g, ' ')}".`);
      continue;
    }

    const action: ValidAction = {
      kind: item.kind,
      memories,
      expenses: expense ? [expense] : [],
    };

    if (item.kind === 'reschedule_entry') {
      const when = resolveWhen(item.newDate, item.newTime);
      if (!when) {
        refused.push('That new date could not be read.');
        continue;
      }
      if (!allowPast && when.getTime() < now.getTime()) {
        refused.push(`${fullDateLabel(when.toISOString())} has already passed.`);
        continue;
      }
      action.newDate = when.toISOString();
      action.newTimeStated = /^\d{1,2}:\d{2}$/.test(item.newTime ?? '');
    }

    if (item.kind === 'change_priority') {
      const priority = (item.newPriority ?? '').toLowerCase();
      if (!(PRIORITIES as readonly string[]).includes(priority)) {
        refused.push(`"${item.newPriority}" is not a priority.`);
        continue;
      }
      action.newPriority = priority as Priority;
    }

    if (item.kind === 'edit_amount') {
      const amount = item.newAmount;
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
        refused.push('That amount could not be read.');
        continue;
      }
      action.newAmount = amount;
    }

    if (item.kind === 'change_category') {
      // The two zones keep their own categories: an entry may only move to one
      // of the app's fixed categories, an expense only to one that exists.
      const wanted = (item.newCategory ?? '').trim();
      const allowed = expense ? (candidates.expenseCategories ?? []) : [...CATEGORIES];
      const match = allowed.find((name) => name.toLowerCase() === wanted.toLowerCase());
      if (!match) {
        refused.push(`"${wanted}" is not one of your categories.`);
        continue;
      }
      action.newCategory = match;
    }

    const count = action.memories.length + action.expenses.length;
    if (touched + count > MAX_BATCH) {
      trimmed = true;
      const room = MAX_BATCH - touched;
      if (room <= 0) continue;
      action.memories = action.memories.slice(0, room);
      action.expenses = action.expenses.slice(0, Math.max(0, room - action.memories.length));
    }

    touched += action.memories.length + action.expenses.length;
    actions.push(action);
  }

  return { actions, refused, trimmed };
}

/** A date, with an optional clock time, as the model gave them. */
function resolveWhen(date: string | null | undefined, time: string | null | undefined): Date | null {
  if (!date) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00` : date;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;

  if (time && /^\d{1,2}:\d{2}$/.test(time)) {
    const [hours, minutes] = time.split(':').map(Number);
    when.setHours(hours, minutes, 0, 0);
  }
  return when;
}

export interface Change {
  /** What is changing, e.g. the entry's title. */
  label: string;
  before: string;
  after: string;
}

const whenLabel = (memory: Pick<Memory, 'eventDate' | 'dateExpression'>): string =>
  hasStatedTime(memory.dateExpression)
    ? `${fullDateLabel(memory.eventDate)}, ${timeLabel(memory.eventDate)}`
    : fullDateLabel(memory.eventDate);

/**
 * What a change will look like, before and after, for the confirmation card.
 *
 * Every action must be able to show this: nothing is applied that cannot be
 * described in terms of what it replaces.
 */
export function describeChange(action: ValidAction): Change[] {
  switch (action.kind) {
    case 'reschedule_entry':
      return action.memories.map((memory) => ({
        label: memory.title,
        before: whenLabel(memory),
        // A time given in the instruction counts as stated, even when the
        // entry never had one: "move it to Friday at 4:30" said so just now.
        after: action.newDate
          ? action.newTimeStated
            ? `${fullDateLabel(action.newDate)}, ${timeLabel(action.newDate)}`
            : whenLabel({ eventDate: action.newDate, dateExpression: memory.dateExpression })
          : '—',
      }));
    case 'mark_done':
    case 'mark_many_done':
      return action.memories.map((memory) => ({
        label: memory.title,
        before: memory.status === 'active' ? 'To do' : 'Done',
        after: memory.repeat ? `Done, back on its next ${memory.repeat} turn` : 'Done',
      }));
    case 'reopen_entry':
      return action.memories.map((memory) => ({
        label: memory.title,
        before: 'Done',
        after: 'To do',
      }));
    case 'change_priority':
      return action.memories.map((memory) => ({
        label: memory.title,
        before: memory.priority ?? 'None',
        after: action.newPriority ?? 'None',
      }));
    case 'change_category':
      return [
        ...action.memories.map((memory) => ({
          label: memory.title,
          before: memory.category as string,
          after: action.newCategory ?? '—',
        })),
        ...action.expenses.map((expense) => ({
          label: expense.note || expense.cat_name,
          before: expense.cat_name,
          after: action.newCategory ?? '—',
        })),
      ];
    case 'edit_amount':
      return [
        ...action.memories.map((memory) => ({
          label: memory.title,
          before: memory.amount === null ? 'No amount' : String(memory.amount),
          after: String(action.newAmount ?? 0),
        })),
        ...action.expenses.map((expense) => ({
          label: expense.note || expense.cat_name,
          before: String(expense.amount),
          after: String(action.newAmount ?? 0),
        })),
      ];
    case 'delete_entry':
      return [
        ...action.memories.map((memory) => ({
          label: memory.title,
          before: 'In your record',
          after: 'Deleted',
        })),
        ...action.expenses.map((expense) => ({
          label: expense.note || expense.cat_name,
          before: `${expense.cat_name}, ${expense.amount}`,
          after: 'Deleted',
        })),
      ];
    case 'add_entry':
      return [{ label: action.text ?? 'New entry', before: 'Nothing recorded', after: 'Goes to the review screen' }];
  }
}

/** What the confirmation button should say, and how loudly. */
export function isDestructive(action: ValidAction): boolean {
  return action.kind === 'delete_entry';
}

/** How many rows one batch touches, for "CHANGED 2 ENTRIES". */
export function countTargets(actions: ValidAction[]): { memories: number; expenses: number } {
  return actions.reduce(
    (total, action) => ({
      memories: total.memories + action.memories.length,
      expenses: total.expenses + action.expenses.length,
    }),
    { memories: 0, expenses: 0 }
  );
}

/**
 * What was changed, and in which zone — "CHANGED 2 ENTRIES", "CHANGED 1
 * EXPENSE", or both when one instruction reached across the two records.
 */
export function changeLabel(counts: { memories: number; expenses: number }): string {
  const parts: string[] = [];
  if (counts.memories > 0) {
    parts.push(`${counts.memories} ${counts.memories === 1 ? 'ENTRY' : 'ENTRIES'}`);
  }
  if (counts.expenses > 0) {
    parts.push(`${counts.expenses} ${counts.expenses === 1 ? 'EXPENSE' : 'EXPENSES'}`);
  }
  return parts.length === 0 ? 'NOTHING CHANGED' : `CHANGED ${parts.join(' + ')}`;
}

export interface MemorySnapshot {
  id: string;
  status: Memory['status'];
  eventDate: string;
  priority: Priority | null;
  category: Category;
  amount: number | null;
  deleted: boolean;
}

/** Everything an action could change, kept so it can be put back. */
export function snapshot(memory: Memory): MemorySnapshot {
  return {
    id: memory.id,
    status: memory.status,
    eventDate: memory.eventDate,
    priority: memory.priority,
    category: memory.category,
    amount: memory.amount,
    deleted: false,
  };
}

/**
 * The patch that puts an entry back as it was.
 *
 * Undo restores the fields an action can touch rather than the whole row, so
 * anything changed by something else in the meantime is left alone.
 */
export function undoPatch(before: MemorySnapshot): {
  status: Memory['status'];
  eventDate: string;
  priority: Priority | null;
  category: Category;
  amount: number | null;
} {
  return {
    status: before.status,
    eventDate: before.eventDate,
    priority: before.priority,
    category: before.category,
    amount: before.amount,
  };
}
