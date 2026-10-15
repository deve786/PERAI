/**
 * The app's own spelling memory: what a title sounded like, and how it is
 * really written. Filled from two places — a correction typed in the preview
 * screen, and a spelling confirmed by web search (src/ai/spelling.ts) — and
 * read before either, so a title is only ever looked up once.
 *
 * Pure, so it is unit tested in plain Node. Storage lives in src/db/queries.ts.
 */

/**
 * The key a title is remembered under: sound-ish, free of spelling noise.
 *
 * Malayalam script is kept rather than stripped. Dropping everything outside
 * a-z would turn "രാഹുൽ" into an empty key, which would then match every
 * other script title — one entry swallowing the lot.
 */
export function spellingKey(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ഀ-ൿ]+/g, ' ')
    .trim();
}

export interface Spelling {
  heard: string;
  correct: string;
}

/**
 * The stored spelling for what was heard, or null when it is new.
 *
 * An entry also matches its own corrected form, so a title that came back from
 * search as "Ghost of Yōtei" is recognised when heard correctly next time and
 * never searched again.
 */
export function lookupSpelling(title: string, known: Spelling[]): string | null {
  const key = spellingKey(title);
  if (!key) return null;

  const match = (wanted: string): string | null => {
    // A spelling someone was corrected *to* something else wins over one that
    // merely is that spelling, or the chain would stop at itself.
    for (const entry of known) if (entry.heard === wanted) return entry.correct;
    for (const entry of known) if (spellingKey(entry.correct) === wanted) return entry.correct;
    return null;
  };

  let found = match(key);
  if (found === null) return null;

  // Follow the chain to the one spelling everything points at: "രാഹുൽ" and
  // "Rahool" and "Rahul" are one person, not three entries. Hop-limited, and
  // it stops the moment a spelling points at itself, so a loop cannot hang.
  const seen = new Set([key]);
  for (let hop = 0; hop < 3; hop += 1) {
    const nextKey = spellingKey(found);
    if (seen.has(nextKey)) break;
    seen.add(nextKey);
    const onward = match(nextKey);
    if (onward === null || onward === found) break;
    found = onward;
  }

  return found === title ? null : found;
}

/**
 * Titles worth handing to the speech recognizer as hints, newest first: both
 * sides of everything learned, plus whatever is already in the record.
 */
export function spellingHints(known: Spelling[], recorded: string[], limit = 60): string[] {
  const seen = new Set<string>();
  const hints: string[] = [];
  for (const title of [...known.map((entry) => entry.correct), ...recorded]) {
    const key = spellingKey(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    hints.push(title);
    if (hints.length >= limit) break;
  }
  return hints;
}
