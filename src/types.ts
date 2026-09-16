/** Domain types shared by the DB layer, the AI layer and the UI. */

export const MEMORY_TYPES = [
  'memory',
  'task',
  'reminder',
  'purchase',
  'appointment',
] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export const CATEGORIES = [
  'Personal Care',
  'Work',
  'Shopping',
  'Entertainment',
  'Fitness',
  'Travel',
  'Health',
  'Other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const PRIORITIES = ['low', 'medium', 'high'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const STATUSES = ['active', 'done', 'archived'] as const;
export type Status = (typeof STATUSES)[number];

/** A full stored memory row. */
export interface Memory {
  id: string;
  rawInput: string;
  title: string;
  type: MemoryType;
  category: Category;
  /** ISO timestamp of when the event itself happened / is scheduled. */
  eventDate: string;
  /** The user's original wording, e.g. "two weeks ago". */
  dateExpression: string | null;
  /** ISO timestamp of when this was entered into the system. */
  createdAt: string;
  amount: number | null;
  currency: string | null;
  /** Comma-separated names. */
  people: string | null;
  location: string | null;
  /** Comma-separated tags. */
  tags: string | null;
  priority: Priority | null;
  status: Status;
  confirmed: boolean;
}

/**
 * What the extraction model returns: a memory minus the fields the app owns.
 * `rawInput` is excluded too — it is whatever the user typed, carried
 * alongside the drafts rather than produced by the model.
 */
export type MemoryDraft = Omit<
  Memory,
  'id' | 'createdAt' | 'confirmed' | 'rawInput'
>;

/** A draft carrying a local key so the preview list can track it per-card. */
export interface KeyedDraft {
  key: string;
  draft: MemoryDraft;
}
