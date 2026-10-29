/**
 * The shape of one line of an answer.
 *
 * An answer used to be a list of sentences — "Minicoy total spend: ₹2,904.90
 * (Bills: ₹465.90, Ticket: ₹1,825.00, Food: ₹185.00)" — and on a phone that
 * reads as one long run of text with the figures buried in it. Two places in
 * a row looked like one paragraph.
 *
 * So a line is given its parts instead, and the screen lays them out: a date
 * in the gutter, what it was, what it cost on the right where the eye can run
 * down the column, and a heading above each group so one place ends visibly
 * before the next begins.
 *
 * Pure, so the parsing and grouping below are unit tested in plain Node.
 */

export interface AnswerRow {
  /** Heading this line sits under — a place, a month, a vessel. Null when the list is flat. */
  group: string | null;
  /** Shown in the left gutter. Whatever form it was recorded in. */
  date: string | null;
  /** The line itself: what the thing was. */
  title: string;
  /** Secondary line under the title — category, method, class, ports. */
  detail: string | null;
  /** Shown right-aligned in mono, so figures line up down the column. */
  amount: string | null;
  /** A short aside worth a chip of its own: "Paid back in full", "Refunded ₹1,815". */
  note: string | null;
}

/** A heading and the lines under it. */
export interface AnswerGroup {
  heading: string | null;
  rows: AnswerRow[];
}

const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}$/, // 2026-10-16
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/, // 16/10/26
  /^\d{1,2}\s+\w{3,}\.?\s*\d{0,4}$/, // 16 October 2026
  /^\w{3,}\.?\s+\d{1,2},?\s*\d{0,4}$/, // October 16 2026
];

/** Does this fragment read as a date rather than as a thing? */
export function looksLikeDate(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  // A weekday prefix is still a date: "Thursday, 1 October 2026".
  const withoutWeekday = trimmed.replace(
    /^(?:mon|tues|wednes|thurs|fri|satur|sun)day,?\s*/i,
    ''
  );
  return DATE_PATTERNS.some((pattern) => pattern.test(withoutWeekday));
}

/** Does this fragment read as a money amount or a count? */
export function looksLikeAmount(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  // A currency mark, or digits with nothing but separators around them.
  return (
    /^[₹$€£]\s?[\d,]+(?:\.\d+)?$/.test(trimmed) ||
    /^[A-Z]{3}\s?[\d,]+(?:\.\d+)?$/.test(trimmed) ||
    /^[\d,]+(?:\.\d+)?$/.test(trimmed)
  );
}

/**
 * Read a line the model wrote as prose back into its parts.
 *
 * Used for lines that arrive without structure: answers already in the
 * conversation from before, and the exact answers the app works out itself,
 * which have always been plain strings. The separator is the one the prompt
 * has always asked for.
 */
export function parseAnswerRow(text: string): AnswerRow {
  const cleaned = text.replace(/^\s*[-•*–]\s*/, '').trim();
  const parts = cleaned
    .split(/\s+[·|]\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return { group: null, date: null, title: cleaned, detail: null, amount: null, note: null };
  }

  let date: string | null = null;
  let amount: string | null = null;
  const rest: string[] = [];

  for (const part of parts) {
    if (date === null && looksLikeDate(part)) {
      date = part;
      continue;
    }
    if (looksLikeAmount(part)) {
      // The last amount-looking part wins, so "3 Oct · Taxi · ₹300" keeps ₹300
      // even when something earlier also reads as a number.
      if (amount !== null) rest.push(amount);
      amount = part;
      continue;
    }
    rest.push(part);
  }

  // A trailing bracketed aside — "[Refunded: ₹1,815]" — is a note, not a title.
  let note: string | null = null;
  if (rest.length > 0) {
    const last = rest[rest.length - 1];
    const bracketed = last.match(/^[[(](.+)[\])]$/);
    if (bracketed) {
      note = bracketed[1].trim();
      rest.pop();
    }
  }

  const title = rest.shift() ?? cleaned;
  const detail = rest.length > 0 ? rest.join(' · ') : null;

  return { group: null, date, title, detail, amount, note };
}

/**
 * Words that carry no information of their own in a detail line. A detail made
 * of nothing but these plus the title is filler.
 */
const FILLER = new Set([
  'a', 'an', 'the', 'of', 'in', 'at', 'on', 'for', 'and', 'with', 'from',
  'category', 'categories', 'expense', 'expenses', 'spend', 'spending',
  'spent', 'total', 'totals', 'amount', 'entry', 'entries', 'item', 'items',
  'record', 'records', 'place', 'breakdown', 'cost', 'costs',
]);

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/**
 * Drop a second line that only says again what the row already says.
 *
 * Asked for a detail, a model would rather invent one than leave it empty, so
 * a breakdown of Minicoy came back as six rows each captioned "Minicoy expense
 * category". That is a column of noise next to the figures, and no instruction
 * reliably stopped it — so it is removed here instead.
 */
export function trimRedundantDetail(
  detail: string | null,
  title: string,
  group: string | null
): string | null {
  if (!detail) return null;

  const known = new Set([...words(title), ...words(group ?? '')]);
  const informative = words(detail).filter(
    (word) => !FILLER.has(word) && !known.has(word)
  );
  return informative.length > 0 ? detail : null;
}

/** The one-line form of a row, for grounding checks and for the conversation history. */
export function composeRowText(row: AnswerRow): string {
  const parts = [row.date, row.title, row.detail, row.amount].filter(
    (part): part is string => typeof part === 'string' && part.trim().length > 0
  );
  const line = parts.join(' · ');
  return row.note ? `${line} [${row.note}]` : line;
}

/**
 * Turn a flat list into the sections the screen draws.
 *
 * Consecutive rows sharing a heading belong together. A list where nothing
 * carries a heading comes back as a single unnamed section, which draws
 * exactly as a plain list did.
 */
export function groupAnswerRows(rows: AnswerRow[]): AnswerGroup[] {
  const groups: AnswerGroup[] = [];
  for (const row of rows) {
    const heading = row.group && row.group.trim().length > 0 ? row.group.trim() : null;
    const current = groups[groups.length - 1];
    if (current && current.heading === heading) {
      current.rows.push(row);
    } else {
      groups.push({ heading, rows: [row] });
    }
  }
  return groups;
}

/** True when the sections are worth drawing as sections rather than as one list. */
export function hasSections(groups: AnswerGroup[]): boolean {
  return groups.length > 1 && groups.every((group) => group.heading !== null);
}

/**
 * Read whatever the result carries — structured rows, or the plain strings
 * older answers and the app's own exact answers produce — as rows.
 */
export function toAnswerRows(items: string[], rows?: AnswerRow[] | null): AnswerRow[] {
  if (rows && rows.length > 0) return rows;
  return items.map(parseAnswerRow);
}
