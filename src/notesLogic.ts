/** Plain notes: text you want to keep, with a category. Not tasks, never reminded. */
export interface Note {
  id: string;
  title: string;
  body: string;
  category: string;
  pinned: number; // 0 | 1
  /** The day the note is about, YYYY-MM-DD. Chosen when saving; defaults to today. */
  note_date: string;
  created_at: string;
  updated_at: string;
}

/** Offered before you have made any of your own. */
export const DEFAULT_NOTE_CATEGORIES = ['Personal', 'Work', 'Ideas', 'Health', 'Money', 'Other'];

/** Used when a note is saved without choosing one. */
export const UNSORTED = 'Other';

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** What to call a note in a list: its title, or else the first line of it. */
export function noteTitle(note: Pick<Note, 'title' | 'body'>): string {
  const title = note.title.trim();
  if (title) return title;
  const first = note.body.split('\n').find((line) => line.trim());
  return first ? first.trim() : 'Untitled note';
}

/** The text under the title: the body, without repeating a first line used as the title. */
export function notePreview(note: Pick<Note, 'title' | 'body'>, max = 140): string {
  let lines = note.body.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!note.title.trim()) lines = lines.slice(1);
  const text = lines.join(' · ');
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/**
 * Categories to offer: the ones in use (most used first), then the defaults
 * not yet used. Your own categories are just the names you have typed.
 */
export function noteCategories(notes: Pick<Note, 'category'>[]): { name: string; count: number }[] {
  const out: { name: string; count: number }[] = [];
  for (const n of notes) {
    const hit = out.find((o) => same(o.name, n.category));
    if (hit) hit.count += 1;
    else out.push({ name: n.category.trim() || UNSORTED, count: 1 });
  }
  out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  for (const name of DEFAULT_NOTE_CATEGORIES) {
    if (!out.some((o) => same(o.name, name))) out.push({ name, count: 0 });
  }
  return out;
}

/** Pinned first, then newest note date, then most recently changed. Narrowed by category and by words in the title or text. */
export function visibleNotes(
  notes: Note[],
  opts: { category?: string | null; query?: string }
): Note[] {
  const words = (opts.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return notes
    .filter((n) => !opts.category || same(n.category, opts.category))
    .filter((n) => {
      if (words.length === 0) return true;
      const hay = `${n.title} ${n.body} ${n.category}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort(
      (a, b) =>
        b.pinned - a.pinned ||
        b.note_date.localeCompare(a.note_date) ||
        b.updated_at.localeCompare(a.updated_at)
    );
}

/** A note with nothing in it is not worth keeping. */
export function isBlankNote(n: Pick<Note, 'title' | 'body'>): boolean {
  return !n.title.trim() && !n.body.trim();
}

const MAX_CATEGORY_LENGTH = 24;

/**
 * What to do with a category the AI suggested for a note's title: use one you
 * already have, offer it as a new category, or leave the note unsorted.
 */
export function readCategoryGuess(
  reply: string | null,
  existing: string[]
): { kind: 'existing' | 'new'; name: string } | null {
  const clean = (reply ?? '').trim().replace(/^["'.]+|["'.]+$/g, '').trim();
  if (!clean || clean.length > MAX_CATEGORY_LENGTH || same(clean, UNSORTED)) return null;
  const hit = existing.find((n) => same(n, clean));
  return hit ? { kind: 'existing', name: hit } : { kind: 'new', name: clean };
}

/** The words a note's category is guessed from: its title, or the first line of the text. */
export function guessSource(note: Pick<Note, 'title' | 'body'>): string {
  const title = note.title.trim();
  if (title) return title;
  const first = note.body.split('\n').find((line) => line.trim()) ?? '';
  return first.trim().slice(0, 80);
}
