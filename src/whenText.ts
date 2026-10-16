/**
 * Reading a date out of a typed line, on the phone.
 *
 * "Table parcel by tomorrow 9am" is a title and a time, not a title. The
 * Record tab gets that reading from the model, which costs seconds and a
 * call — fine for a note, unbearable when a checklist is being typed into a
 * group a line at a time. So the handful of ways people actually write a date
 * are read here instead: instant, free, and wrong about nothing it does not
 * recognise, since anything unrecognised simply leaves the line alone.
 *
 * Pure, so it is unit tested in plain Node.
 */

export interface When {
  /** What is left of the line once the date words are taken out. */
  title: string;
  /** When it is for, or null when the line said nothing about time. */
  eventDate: string | null;
  /**
   * The words that said it, kept as written. src/format.ts reads this to
   * decide whether a clock time was actually stated or merely defaulted.
   */
  dateExpression: string | null;
}

/** Where a day lands when a date was given with no time of day. */
const DEFAULT_HOUR = 9;

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;

/** Times of day people name rather than state. */
const NAMED_TIMES: { pattern: RegExp; hour: number }[] = [
  { pattern: /\bmidnight\b/i, hour: 0 },
  { pattern: /\b(?:early\s+)?morning\b|\bravile\b/i, hour: 9 },
  { pattern: /\bnoon\b|\bmidday\b/i, hour: 12 },
  { pattern: /\bafternoon\b|\buchakku\b/i, hour: 15 },
  { pattern: /\bevening\b|\bvaikunneram\b|\bvykunneram\b/i, hour: 18 },
  { pattern: /\bnight\b|\braathri\b|\brathri\b/i, hour: 20 },
];

/** The marker left where a matched phrase was lifted out of the line. */
const HOLE = '\u0000';

function startOfDay(from: Date): Date {
  const date = new Date(from);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** The next time this weekday comes round. Today itself counts as next week. */
function nextWeekday(from: Date, weekday: number, allowToday: boolean): Date {
  const date = startOfDay(from);
  const ahead = (weekday - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + (ahead === 0 && !allowToday ? 7 : ahead));
  return date;
}

/**
 * A bare hour with no am/pm: "at 5" is the afternoon, "at 9" the morning.
 *
 * Everything from 1 to 6 is read as the afternoon or evening, which is what
 * people mean by them; 7 to 12 are taken as written, and anything above 12 is
 * already unambiguous.
 */
function resolveHour(hour: number, suffix: string | undefined): number {
  if (suffix) {
    const pm = /^p/i.test(suffix);
    if (hour === 12) return pm ? 12 : 0;
    return pm ? hour + 12 : hour;
  }
  if (hour >= 1 && hour <= 6) return hour + 12;
  return hour === 24 ? 0 : hour;
}

/**
 * Read a line into a title and, when it says one, a time.
 *
 * Nothing recognised means nothing changed: the line comes back as the title
 * with no date, and the caller decides what to do about that.
 */
export function parseWhen(text: string, now: Date = new Date()): When {
  let rest = text;
  const said: string[] = [];

  /** Lift the first match of a pattern out of the line, if it is there. */
  const take = (pattern: RegExp): RegExpMatchArray | null => {
    const match = rest.match(pattern);
    if (!match || match.index === undefined) return null;
    said.push(match[0].trim());
    rest = rest.slice(0, match.index) + HOLE + rest.slice(match.index + match[0].length);
    return match;
  };

  let day: Date | null = null;
  let hour: number | null = null;
  let minute = 0;

  // ---- the day, longest phrasings first so "day after tomorrow" wins ----
  if (take(/\bday\s+after\s+tomorrow\b|\b(?:nale|naale)\s+kazhinj(?:u|ju)\b/i)) {
    day = startOfDay(now);
    day.setDate(day.getDate() + 2);
  } else if (take(/\btomorrow\b|\btmrw\b|\btmr\b|\bnale\b|\bnaale\b/i)) {
    day = startOfDay(now);
    day.setDate(day.getDate() + 1);
  } else if (take(/\byesterday\b|\binnale\b/i)) {
    day = startOfDay(now);
    day.setDate(day.getDate() - 1);
  } else if (take(/\btonight\b/i)) {
    day = startOfDay(now);
    hour = 20;
  } else if (take(/\btoday\b|\binnu\b|\binnathe\b/i)) {
    day = startOfDay(now);
  } else if (take(/\bnext\s+week\b|\badutha\s+aazhcha\b/i)) {
    day = startOfDay(now);
    day.setDate(day.getDate() + 7);
  } else if (take(/\bnext\s+month\b/i)) {
    day = startOfDay(now);
    day.setMonth(day.getMonth() + 1);
  } else if (take(/\bin\s+(\d{1,3})\s+(day|days|week|weeks|month|months)\b/i)) {
    const match = said[said.length - 1].match(/(\d{1,3})\s+(\w+)/i)!;
    const count = Number(match[1]);
    day = startOfDay(now);
    if (/^month/i.test(match[2])) day.setMonth(day.getMonth() + count);
    else day.setDate(day.getDate() + count * (/^week/i.test(match[2]) ? 7 : 1));
  } else {
    // "next friday", "this friday", or a bare weekday meaning the next one.
    const weekday = take(
      new RegExp(`\\b(next\\s+|this\\s+|coming\\s+)?(${WEEKDAYS.join('|')})\\b`, 'i')
    );
    if (weekday) {
      const index = WEEKDAYS.indexOf(weekday[2].toLowerCase() as (typeof WEEKDAYS)[number]);
      day = nextWeekday(now, index, /this|coming/i.test(weekday[1] ?? ''));
      if (/next/i.test(weekday[1] ?? '') && day.getTime() - startOfDay(now).getTime() < 7 * 86400000) {
        day.setDate(day.getDate() + 7);
      }
    } else {
      // "5 nov", "nov 5", "on the 5th".
      const monthFirst = take(
        new RegExp(`\\b(${MONTHS.join('|')})\\w*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i')
      );
      const dayFirst =
        monthFirst ??
        take(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTHS.join('|')})\\w*\\b`, 'i'));

      if (monthFirst) {
        day = startOfDay(now);
        day.setMonth(MONTHS.indexOf(monthFirst[1].toLowerCase() as (typeof MONTHS)[number]));
        day.setDate(Number(monthFirst[2]));
        if (day.getTime() < startOfDay(now).getTime()) day.setFullYear(day.getFullYear() + 1);
      } else if (dayFirst) {
        day = startOfDay(now);
        day.setMonth(MONTHS.indexOf(dayFirst[2].toLowerCase() as (typeof MONTHS)[number]));
        day.setDate(Number(dayFirst[1]));
        if (day.getTime() < startOfDay(now).getTime()) day.setFullYear(day.getFullYear() + 1);
      } else {
        const ordinal = take(/\bon\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
        if (ordinal) {
          day = startOfDay(now);
          day.setDate(Number(ordinal[1]));
          if (day.getTime() < startOfDay(now).getTime()) day.setMonth(day.getMonth() + 1);
        }
      }
    }
  }

  // ---- the time of day ----
  const clock =
    take(/\b(\d{1,2})[:.](\d{2})\s*(am|pm|a\.m\.|p\.m\.)\b/i) ??
    take(/\b(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)\b/i) ??
    take(/\bat\s+(\d{1,2})[:.](\d{2})\b/i) ??
    take(/\b(\d{1,2}):(\d{2})\b/) ??
    take(/\bat\s+(\d{1,2})\b/i);

  if (clock) {
    const parts = clock.slice(1).filter((part) => part !== undefined);
    const rawHour = Number(parts[0]);
    const suffix = parts.find((part) => /^(am|pm|a\.m\.|p\.m\.)$/i.test(part));
    const minutes = parts[1] && /^\d{2}$/.test(parts[1]) && parts[1] !== suffix ? Number(parts[1]) : 0;
    if (Number.isFinite(rawHour) && rawHour <= 24 && minutes < 60) {
      hour = resolveHour(rawHour, suffix);
      minute = minutes;
    }
  } else if (hour === null) {
    for (const named of NAMED_TIMES) {
      if (take(named.pattern)) {
        hour = named.hour;
        break;
      }
    }
  }

  if (day === null && hour === null) {
    return { title: tidy(text), eventDate: null, dateExpression: null };
  }

  const when = day ?? startOfDay(now);
  when.setHours(hour ?? DEFAULT_HOUR, minute, 0, 0);

  // A time on its own means today when it is still ahead, tomorrow once it is
  // past: "9am" typed at eleven in the morning is not nine this morning.
  if (day === null && when.getTime() <= now.getTime()) {
    when.setDate(when.getDate() + 1);
  }

  return {
    title: tidy(rest),
    eventDate: when.toISOString(),
    dateExpression: said.join(' ').replace(/\s+/g, ' ').trim() || null,
  };
}

/**
 * What is left of the line, read as a title.
 *
 * The little words that pointed at the date — "by", "on", "at" — go with it,
 * but only where the date actually was, so "meet at the cafe tomorrow" keeps
 * its "at".
 */
function tidy(text: string): string {
  const cleaned = text
    .replace(new RegExp(`\\s*\\b(by|on|at|due|before|around|from|for)\\b\\s*${HOLE}`, 'gi'), ' ')
    .split(HOLE)
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '')
    .trim();

  return cleaned ? cleaned[0].toUpperCase() + cleaned.slice(1) : cleaned;
}
