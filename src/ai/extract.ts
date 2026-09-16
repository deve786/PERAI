import {
  CATEGORIES,
  MEMORY_TYPES,
  PRIORITIES,
  STATUSES,
  type Category,
  type MemoryDraft,
  type MemoryType,
  type Priority,
} from '../types';
import { DEFAULT_CURRENCY } from '../constants';
import { EXTRACT_MODEL, requestJson } from './client';

/** Thrown when the model replied but we could not read a memory out of it. */
export class ExtractionError extends Error {
  constructor(message = "Couldn't understand that — try rephrasing.") {
    super(message);
    this.name = 'ExtractionError';
  }
}

const NULLABLE_STRING = { type: ['string', 'null'] } as const;

/**
 * Enforced server-side via `output_config.format`, so the model cannot return
 * prose or a different shape. We still parse defensively below.
 */
const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    memories: {
      type: 'array',
      description: 'One entry per distinct event found in the input.',
      items: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Short third-person summary, max ~8 words.',
          },
          type: { type: 'string', enum: [...MEMORY_TYPES] },
          category: { type: 'string', enum: [...CATEGORIES] },
          eventDate: {
            type: 'string',
            description: 'ISO 8601 timestamp of when the event happened.',
          },
          dateExpression: NULLABLE_STRING,
          amount: { type: ['number', 'null'] },
          currency: NULLABLE_STRING,
          people: NULLABLE_STRING,
          location: NULLABLE_STRING,
          tags: NULLABLE_STRING,
          priority: NULLABLE_STRING,
          status: { type: 'string', enum: [...STATUSES] },
        },
        required: [
          'title',
          'type',
          'category',
          'eventDate',
          'dateExpression',
          'amount',
          'currency',
          'people',
          'location',
          'tags',
          'priority',
          'status',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['memories'],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You extract structured life events from a person's own short notes about their day.

Return one entry per DISTINCT event. A single sentence often contains several:
"I went to Kozhikode yesterday and bought a shirt for 1200 rupees" is two
entries — a travel memory and a purchase. Do not merge distinct events, and do
not split one event into several just because it has several details.

TYPE — pick exactly one:
- "reminder"    the note explicitly asks to be reminded ("remind me to...")
- "task"        something the person still needs to do
- "appointment" a scheduled event at a specific future time
- "purchase"    something they bought
- "memory"      default: something that already happened

CATEGORY — pick the closest of: ${CATEGORIES.join(', ')}. Use "Other" only when
nothing else fits.

DATES — resolve every relative expression ("yesterday", "two weeks ago",
"last Monday", "tomorrow at 5") against the current timestamp given in the user
message, and return eventDate as a full ISO 8601 timestamp. Put the person's
original wording in dateExpression ("two weeks ago"); use null when they gave no
time reference at all. When only a date is implied and no clock time, use 12:00
local time on that date. When no date is implied anywhere, use the current
timestamp for a "memory" or "purchase", and leave dateExpression null.

NEVER INVENT. If the note does not imply an amount, a person, a location, a
tag, or a priority, return null for that field. Do not guess a price, do not
infer who was present, do not add a city that was not mentioned. Returning null
is always correct when the note is silent.

OTHER FIELDS:
- amount/currency: only for things bought or paid for. Infer the currency from
  context (rupees -> INR, $ -> USD); default to ${DEFAULT_CURRENCY} when an
  amount is present but the currency is unstated.
- people: comma-separated names actually mentioned, else null.
- tags: 1-3 short lowercase keywords useful for later search, comma-separated.
- priority: one of ${PRIORITIES.join(', ')} — only when urgency is expressed.
- status: "active" unless the note says it is already finished, then "done".
- title: a short factual summary, no invented detail.`;

/** Pull the first JSON value out of a response that may be fenced or padded. */
function looseJsonParse(raw: string): unknown {
  const text = raw.trim();
  const candidates: string[] = [text];

  // ```json ... ``` or a bare fenced block
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  // First {...} / [...] span, for models that wrap JSON in a sentence.
  const objectStart = text.indexOf('{');
  const objectEnd = text.lastIndexOf('}');
  if (objectStart !== -1 && objectEnd > objectStart) {
    candidates.push(text.slice(objectStart, objectEnd + 1));
  }
  const arrayStart = text.indexOf('[');
  const arrayEnd = text.lastIndexOf(']');
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    candidates.push(text.slice(arrayStart, arrayEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next shape
    }
  }
  throw new ExtractionError();
}

function pickEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return typeof value === 'string' &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function nullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isoOr(value: unknown, fallbackISO: string): string {
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return fallbackISO;
}

/**
 * Coerce one raw item into a MemoryDraft. A bad individual field is replaced
 * with a safe default rather than dropping the whole entry — the user sees and
 * can edit every field in the preview before anything is stored.
 */
function normaliseDraft(item: unknown, nowISO: string): MemoryDraft | null {
  if (typeof item !== 'object' || item === null) return null;
  const raw = item as Record<string, unknown>;

  const title = nullableString(raw.title);
  if (!title) return null;

  const amount =
    typeof raw.amount === 'number' && Number.isFinite(raw.amount)
      ? raw.amount
      : null;

  return {
    title,
    type: pickEnum<MemoryType>(raw.type, MEMORY_TYPES, 'memory'),
    category: pickEnum<Category>(raw.category, CATEGORIES, 'Other'),
    eventDate: isoOr(raw.eventDate, nowISO),
    dateExpression: nullableString(raw.dateExpression),
    amount,
    currency:
      amount === null ? null : nullableString(raw.currency) ?? DEFAULT_CURRENCY,
    people: nullableString(raw.people),
    location: nullableString(raw.location),
    tags: nullableString(raw.tags),
    priority:
      raw.priority == null
        ? null
        : pickEnum<Priority>(raw.priority, PRIORITIES, 'medium'),
    status: pickEnum(raw.status, STATUSES, 'active'),
  };
}

/**
 * Extract one or more structured memory drafts from a free-text note.
 *
 * @param text   exactly what the user typed
 * @param nowISO the moment relative dates are resolved against
 */
export async function extractMemories(
  text: string,
  nowISO: string
): Promise<MemoryDraft[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const weekday = new Date(nowISO).toLocaleDateString('en-US', {
    weekday: 'long',
  });

  const body = (
    await requestJson({
      model: EXTRACT_MODEL,
      system: SYSTEM_PROMPT,
      user: `Current timestamp: ${nowISO} (${weekday})\n\nNote:\n${trimmed}`,
      schemaName: 'extracted_memories',
      schema: EXTRACTION_SCHEMA,
    })
  ).trim();

  if (!body) throw new ExtractionError();

  const parsed = looseJsonParse(body);
  const items = Array.isArray(parsed)
    ? parsed
    : (parsed as { memories?: unknown })?.memories;

  if (!Array.isArray(items)) throw new ExtractionError();

  const drafts = items
    .map((item) => normaliseDraft(item, nowISO))
    .filter((draft): draft is MemoryDraft => draft !== null);

  if (drafts.length === 0) throw new ExtractionError();
  return drafts;
}
