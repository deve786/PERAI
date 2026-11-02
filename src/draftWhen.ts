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
