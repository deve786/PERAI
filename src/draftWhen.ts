/**
 * The same clock time on another day. Choosing a day for a note keeps the time
 * it already had ("dinner at 8") rather than resetting it to midnight.
 */
export function withDay(iso: string, day: Date): string {
  const when = new Date(iso);
  when.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
  return when.toISOString();
}

/** Whether an ISO timestamp falls on the same calendar day as `day` (local time). */
export function isSameDay(iso: string, day: Date): boolean {
  const a = new Date(iso);
  return a.getFullYear() === day.getFullYear() && a.getMonth() === day.getMonth() && a.getDate() === day.getDate();
}

/** What the person set before saving, which beats what the AI guessed. Anything left out is the AI's call. */
export interface NoteChoices {
  /** The day to file it on. */
  day?: Date | null;
  priority?: 'low' | 'medium' | 'high' | null;
}

/** A draft with the person's own date and priority laid over the AI's. */
export function applyChoices<T extends { eventDate: string; priority: 'low' | 'medium' | 'high' | null }>(
  draft: T,
  choices: NoteChoices | undefined
): T {
  if (!choices) return draft;
  let out = draft;
  if (choices.day) out = { ...out, eventDate: withDay(out.eventDate, choices.day) };
  if (choices.priority) out = { ...out, priority: choices.priority };
  return out;
}
