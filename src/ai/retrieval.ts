import { normalizeQuery } from '../manglish';
import { CATEGORIES, MEMORY_TYPES, type Category, type Memory, type MemoryType } from '../types';

/**
 * Cheap on-device retrieval. No embeddings, no vector store — just keyword
 * overlap plus a couple of structural hints, which is enough to narrow a
 * personal timeline down to a promptable slice.
 */

export const MAX_CONTEXT_MEMORIES = 200;

const STOPWORDS = new Set([
  'a', 'about', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at', 'be',
  'been', 'but', 'by', 'can', 'did', 'do', 'does', 'for', 'from', 'get', 'got',
  'had', 'has', 'have', 'how', 'i', 'if', 'in', 'is', 'it', 'its', 'last',
  'many', 'me', 'much', 'my', 'of', 'often', 'on', 'or', 'she', 'so', 'that',
  'the', 'their', 'them', 'then', 'there', 'they', 'this', 'to', 'was', 'we',
  'were', 'what', 'when', 'where', 'which', 'who', 'why', 'will', 'with',
  'you', 'your',
]);

/** Words that hint at a category without naming it. */
const CATEGORY_HINTS: Record<Category, string[]> = {
  'Personal Care': ['haircut', 'hair', 'barber', 'salon', 'shave', 'grooming', 'spa', 'nails'],
  Work: ['work', 'meeting', 'office', 'client', 'deadline', 'project', 'boss', 'standup', 'interview'],
  Shopping: ['bought', 'buy', 'purchase', 'spend', 'spent', 'cost', 'price', 'order', 'shop', 'paid'],
  Entertainment: ['movie', 'film', 'concert', 'game', 'show', 'series', 'watched', 'music', 'party'],
  Fitness: ['gym', 'run', 'ran', 'workout', 'exercise', 'yoga', 'training', 'walk', 'cycling'],
  Travel: ['trip', 'travel', 'flight', 'went', 'visit', 'visited', 'hotel', 'train', 'drove', 'journey'],
  Health: ['doctor', 'dentist', 'medicine', 'sick', 'hospital', 'checkup', 'clinic', 'pain', 'vaccine'],
  Other: [],
};

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

/** Crude singular/plural folding so "haircuts" matches "haircut". */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}

export interface DateRange {
  from: Date;
  to: Date;
  label: string;
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** Monday of the week `d` falls in. */
function startOfWeek(d: Date): Date {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // getDay() is 0 for Sunday, which belongs to the week that began six days ago.
  const shift = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - shift);
  return monday;
}

const MONTH_PATTERN = new RegExp(
  `\\b(${MONTHS.map((m) => `${m.slice(0, 3)}(?:${m.slice(3)})?`).join('|')})\\.?\\s*(\\d{4})?\\b`
);

/**
 * "in March", "June 2025", "last december".
 *
 * A bare month name with no year means the most recent time that month
 * happened: asked in October, "in December" is last December, not the one
 * still to come, because the record only ever holds the past.
 */
function matchMonth(q: string, now: Date): DateRange | null {
  const found = q.match(MONTH_PATTERN);
  if (!found) return null;

  // "may" is also an ordinary English verb ("how much may I spend"), so it
  // only counts as a month when a year or a date-ish word sits beside it.
  const name = found[1];
  if (name.startsWith('may') && !found[2] && !/\b(?:in|during|of|for|last|this)\s+may\b/.test(q)) {
    return null;
  }

  const index = MONTHS.findIndex((month) => month.startsWith(name.slice(0, 3)));
  if (index === -1) return null;

  const year = found[2]
    ? Number(found[2])
    : index <= now.getMonth()
      ? now.getFullYear()
      : now.getFullYear() - 1;

  const label = `${MONTHS[index][0].toUpperCase()}${MONTHS[index].slice(1)} ${year}`;
  return {
    from: new Date(year, index, 1),
    // Day 0 of the next month is the last day of this one.
    to: new Date(year, index + 1, 0, 23, 59, 59, 999),
    label,
  };
}

const YEAR_BEFORE = /\b(?:in|during|of|for|from|since|on|year|through|till|until|between|and|before|after)$/;
const YEAR_AFTER = /^(?:spending|spend|spent|expenses?|total|totals|summary|budget|income|memories|notes|onwards)\b/;
const MONEY_BEFORE = /(?:₹|\$|rs\.?|inr|usd|aed|eur|about|around|nearly|roughly|only|just)$/;
const MONEY_AFTER = /^(?:rupees?|rs\.?|inr|bucks|dollars?|usd|aed|eur|each|per|only|worth)\b/;

/**
 * A four-digit number in a question is a year far less often than it is an
 * amount: "did I spend 2000 last month" used to be read as the whole of the
 * year 2000, which searched an empty window and answered "nothing recorded".
 *
 * So a year has to look like one: inside a plausible range, introduced by a
 * word that frames a year, and not sitting next to money.
 */
function matchYear(q: string, now: Date): number | null {
  const pattern = /\b(\d{4})\b/g;
  const earliest = 1990;
  const latest = now.getFullYear() + 5;

  for (let found = pattern.exec(q); found; found = pattern.exec(q)) {
    const year = Number(found[1]);
    if (year < earliest || year > latest) continue;

    const before = q.slice(0, found.index).trimEnd();
    const after = q.slice(found.index + found[1].length).trimStart();
    if (MONEY_BEFORE.test(before) || MONEY_AFTER.test(after)) continue;
    if (YEAR_BEFORE.test(before) || YEAR_AFTER.test(after)) return year;
    // A question that is nothing but the year ("2024?") is about the year.
    if (before === '' && after.replace(/[^a-z0-9]/g, '') === '') return year;
  }
  return null;
}

/**
 * Detect a time window named in the question. Returns null when the question
 * names no period, in which case the whole timeline stays eligible.
 */
export function guessDateRange(question: string, now: Date): DateRange | null {
  const q = question.toLowerCase();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  // A named month, with or without a year: "in March", "June 2025". Checked
  // before the bare-year rule so "March 2026" is read as the month, not 2026.
  const namedMonth = matchMonth(q, now);
  if (namedMonth) return namedMonth;

  const explicitYear = matchYear(q, now);
  if (explicitYear !== null) {
    return {
      from: new Date(explicitYear, 0, 1),
      to: new Date(explicitYear, 11, 31, 23, 59, 59, 999),
      label: String(explicitYear),
    };
  }

  // "in the last 3 weeks", "past 6 months", "last 10 days"
  const relative = q.match(/\b(?:last|past|previous)\s+(\d+)\s+(day|week|month|year)s?\b/);
  if (relative) {
    const count = Number(relative[1]);
    const unit = relative[2];
    const from = new Date(now);
    if (unit === 'day') from.setDate(from.getDate() - count);
    if (unit === 'week') from.setDate(from.getDate() - count * 7);
    if (unit === 'month') from.setMonth(from.getMonth() - count);
    if (unit === 'year') from.setFullYear(from.getFullYear() - count);
    return { from: startOfDay(from), to: endOfDay(now), label: `last ${count} ${unit}s` };
  }

  if (/\btoday\b/.test(q)) return { from: startOfDay(now), to: endOfDay(now), label: 'today' };

  if (/\byesterday\b/.test(q)) {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { from: startOfDay(y), to: endOfDay(y), label: 'yesterday' };
  }

  // Calendar weeks, Monday-based. "Last week" is the week that has finished,
  // not the last fourteen days: the old window folded this week's entries into
  // every "what did I spend last week" answer and inflated the total.
  if (/\b(?:last|past|previous)\s+week\b/.test(q)) {
    const monday = startOfWeek(now);
    const from = new Date(monday);
    from.setDate(from.getDate() - 7);
    const to = new Date(monday);
    to.setDate(to.getDate() - 1);
    return { from: startOfDay(from), to: endOfDay(to), label: 'last week' };
  }

  if (/\bthis\s+week\b/.test(q)) {
    return { from: startOfDay(startOfWeek(now)), to: endOfDay(now), label: 'this week' };
  }

  if (/\bthis\s+month\b/.test(q)) {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: endOfDay(now),
      label: 'this month',
    };
  }

  if (/\blast\s+month\b/.test(q)) {
    return {
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
      label: 'last month',
    };
  }

  if (/\bthis\s+year\b/.test(q)) {
    return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now), label: 'this year' };
  }

  if (/\blast\s+year\b/.test(q)) {
    return {
      from: new Date(now.getFullYear() - 1, 0, 1),
      to: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999),
      label: 'last year',
    };
  }

  return null;
}

function guessCategories(question: string, words: string[]): Category[] {
  const q = question.toLowerCase();
  const stems = new Set(words.map(stem));
  const hits: Category[] = [];

  for (const category of CATEGORIES) {
    if (q.includes(category.toLowerCase())) {
      hits.push(category);
      continue;
    }
    if (CATEGORY_HINTS[category].some((hint) => stems.has(stem(hint)))) {
      hits.push(category);
    }
  }
  return hits;
}

function guessTypes(question: string): MemoryType[] {
  const q = question.toLowerCase();
  return MEMORY_TYPES.filter((type) => q.includes(type));
}

/** Text of a memory that keyword matching runs against, with field weights. */
function weightedFields(memory: Memory): Array<{ text: string; weight: number }> {
  return [
    { text: memory.title, weight: 3 },
    { text: memory.tags ?? '', weight: 3 },
    { text: memory.rawInput, weight: 2 },
    { text: memory.category, weight: 1 },
    { text: memory.location ?? '', weight: 1 },
    { text: memory.people ?? '', weight: 1 },
    { text: memory.type, weight: 1 },
  ];
}

export interface RetrievalResult {
  memories: Memory[];
  /** Populated when the question named a time period; used in the prompt. */
  range: DateRange | null;
  /** True when at least one memory matched on keywords rather than recency. */
  hadKeywordMatch: boolean;
  /**
   * How many memories were eligible before `limit` was applied.
   *
   * A total worked out from a slice of a period is simply wrong, so the caller
   * has to be able to tell the model when it is not seeing everything.
   */
  poolSize: number;
}

/**
 * Rank the timeline against a question and return the slice worth prompting.
 *
 * Memories inside a named date range are kept even with no keyword hit, so
 * "what did I spend last month" still sees the month. Otherwise ranking is
 * keyword overlap first, recency as the tiebreaker.
 */
export function selectRelevantMemories(
  question: string,
  all: Memory[],
  now: Date = new Date(),
  limit: number = MAX_CONTEXT_MEMORIES
): RetrievalResult {
  // Malayalam and Manglish are turned into their English equivalents first,
  // so everything below — keywords, category hints, the date range — works on
  // "last month expense" whether it was asked that way or as "kazhinja maasam
  // chelavu". A plain English question passes through unchanged.
  const normalized = normalizeQuery(question);
  const asked = normalized.hits > 0 ? normalized.text : question;

  const range = guessDateRange(asked, now);
  const words = tokenize(asked);
  const stems = words.map(stem);
  const categories = new Set(guessCategories(asked, words));
  const types = new Set(guessTypes(asked));

  const pool = range
    ? all.filter((memory) => {
        const at = new Date(memory.eventDate).getTime();
        return at >= range.from.getTime() && at <= range.to.getTime();
      })
    : all;

  // A named range with nothing in it is a real answer ("nothing recorded"),
  // so don't silently widen back to the full timeline.
  const candidates = pool;

  let hadKeywordMatch = false;

  const scored = candidates.map((memory) => {
    let score = 0;

    for (const field of weightedFields(memory)) {
      const fieldStems = tokenize(field.text).map(stem);
      const fieldStemSet = new Set(fieldStems);

      for (const s of stems) {
        if (fieldStemSet.has(s)) {
          score += field.weight;
          continue;
        }
        // Compound words: "cut my hair" should still reach "haircut". Only
        // count it when the shorter token is long enough to be meaningful,
        // so "car" does not match "card".
        const partial = fieldStems.some(
          (fieldStem) =>
            (s.length >= 4 && fieldStem.includes(s)) ||
            (fieldStem.length >= 4 && s.includes(fieldStem))
        );
        if (partial) score += field.weight / 2;
      }
    }

    if (score > 0) hadKeywordMatch = true;
    if (categories.has(memory.category)) score += 2;
    if (types.has(memory.type)) score += 2;
    if (range) score += 1;

    return { memory, score, at: new Date(memory.eventDate).getTime() };
  });

  scored.sort((a, b) => (b.score - a.score) || (b.at - a.at));

  return {
    memories: scored.slice(0, limit).map((entry) => entry.memory),
    range,
    hadKeywordMatch,
    poolSize: candidates.length,
  };
}
