/**
 * The app's own spelling memory: what a title sounded like, and how it is
 * really written. Filled from two places — a correction typed in the preview
 * screen, and a spelling confirmed by web search (src/ai/spelling.ts) — and
 * read before either, so a title is only ever looked up once.
 *
 * Pure, so it is unit tested in plain Node. Storage lives in src/db/queries.ts.
 */

/** The key a title is remembered under: sound-ish, free of spelling noise. */
export function spellingKey(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
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
  for (const entry of known) {
    if (entry.heard === key || spellingKey(entry.correct) === key) {
      return entry.correct === title ? null : entry.correct;
    }
  }
  return null;
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
