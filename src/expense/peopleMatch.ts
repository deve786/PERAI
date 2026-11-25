/**
 * The saved people to offer as chips under the "Person" box: all of them while
 * it is empty, and as you type, the ones that contain what you typed (a person
 * whose name you have typed out in full stays, so the chip shows as chosen).
 */
export function matchPeople<T extends { name: string }>(people: T[], typed: string): T[] {
  const needle = typed.trim().toLowerCase();
  if (!needle) return people;
  return people.filter((p) => p.name.toLowerCase().includes(needle));
}
