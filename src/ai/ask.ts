import type { Memory } from '../types';
import { CURRENCY_SYMBOLS } from '../constants';
import { localTimestamp } from '../format';
import { answerFromList, listQuestion } from '../listQuestion';
import { needsTranslation, normalizeQuery } from '../manglish';
import { ASK_MODEL, getEffectiveAskModel, requestJson, requestText } from './client';
import { MAX_CONTEXT_MEMORIES, selectRelevantMemories } from './retrieval';

/** One exchange already in this conversation, oldest first. */
export interface AskTurn {
  question: string;
  answer: string;
}

/** How many past exchanges the model is reminded of. */
export const HISTORY_TURNS = 3;

/**
 * What to search the record with.
 *
 * A follow-up often carries no searchable words of its own — "and the month
 * before?", "who was with me?" — so the question before it is folded in.
 * Without this, retrieval would hand the model an unrelated slice of the
 * record and the follow-up would be answered from the wrong entries.
 */
export function conversationQuery(question: string, history: AskTurn[]): string {
  const previous = history[history.length - 1]?.question ?? '';
  return previous ? `${previous} ${question}` : question;
}

export interface AskResult {
  /** One short sentence: the answer itself. */
  answer: string;
  /**
   * The things the answer is made of, one per line — "3 Sept · Haircut · ₹300".
   * Shown as a list, because a run-on paragraph of dates and amounts is the
   * hardest possible way to read what is really a table.
   */
  items: string[];
  /** A figure the question asked for, e.g. a total. Shown large above the list. */
  headline: string | null;
  /** The memories the model said it used, in the order it cited them. */
  evidence: Memory[];
  /** True when the answer drew on the Expense-mode data block, so the UI can label its source. */
  usedExpenseData: boolean;
  /** False when nothing relevant was recorded — the UI shows a "not found" state. */
  found: boolean;
}

const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    found: {
      type: 'boolean',
      description:
        'True only if the provided memories actually answer the question.',
    },
    answer: { type: 'string', description: 'One short sentence answering the question.' },
    headline: {
      type: ['string', 'null'],
      description:
        'The single figure the question asked for — a total, a count, a date — or null.',
    },
    items: {
      type: 'array',
      description:
        'One line per thing the answer covers, newest first. Each line is short and factual: date, what it was, amount if any.',
      items: { type: 'string' },
    },
    usedMemoryIds: {
      type: 'array',
      description: 'The reference ids (e.g. "M3") of every memory used.',
      items: { type: 'string' },
    },
    usedExpenseData: {
      type: 'boolean',
      description: 'True if any fact in the answer came from the EXPENSE DATA block.',
    },
  },
  required: ['found', 'answer', 'headline', 'items', 'usedMemoryIds', 'usedExpenseData'],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You answer questions about one person's own recorded memories, and also
their recorded expense/income data when it is provided below under EXPENSE
DATA. Together these two sections are the entire world of things you know
about this person. You have no other information about them.

ABSOLUTE RULE: answer ONLY from the MEMORIES and EXPENSE DATA provided in the
user message.

- If neither section contains the answer, set found=false and say plainly
  that there is no recorded memory or expense data for that. Do NOT guess, do
  NOT reason from general knowledge about what people typically do, and do
  NOT pad a non-answer with speculation.
- Never use outside or general knowledge to answer a question about this
  person's history, habits, spending, or whereabouts.
- The two sections are independent records, not duplicates of each other —
  draw on whichever one (or both) actually answers the question. A spending
  question may be answered from EXPENSE DATA, from MEMORIES, or both; do not
  assume one source is more authoritative than the other.
- Every claim in your answer must trace to a specific provided memory or to
  the EXPENSE DATA block. List the reference id of each memory you used in
  usedMemoryIds, in the order you relied on them, and set usedExpenseData to
  true if any fact in your answer came from EXPENSE DATA (false otherwise). If
  found=false, usedMemoryIds must be empty and usedExpenseData must be false.

WHEN THE ANSWER IS PRESENT — this is read on a phone, so answer as a list, not
a paragraph:
- answer: ONE short sentence. "You spent ₹4,300 on six things last month."
  Never a paragraph, never a restatement of the question.
- headline: the single figure asked for, written as it should be read — a
  total ("₹4,300"), a count ("6 times"), a date ("3 March 2026"). Null when the
  question does not ask for one figure.
- items: one line per thing, newest first, each one short and factual in the
  form "3 March · Haircut · ₹300". Include every memory you used, and nothing
  that is not in them. No sentences, no commentary, no bullet characters.
- Quote concrete dates, amounts and names from the memories rather than
  paraphrasing vaguely. Say "3 March 2026", not "recently".

LANGUAGE — answer in the same language and script the question used. A
question in Malayalam script is answered in Malayalam script; one in romanised
Malayalam (Manglish) is answered the same way; an English question is answered
in English. Dates, amounts and names stay exactly as they are recorded. The
citation rules do not change.

FOLLOWING ON — when a conversation is given, the question may lean on it:
- "and the month before?", "what about movies?", "who was with me?" and "how
  much was that?" mean the earlier question again with one thing changed.
  Work out the full question first, then answer that.
- Answer the question as asked now, not the earlier one. Never repeat the
  previous answer unless it is genuinely the answer to this question too.
- The memories, not the conversation, are still the only source of fact.

STATE — every memory says whether it is "still to do" or "done":
- Questions about what is pending, waiting, left, remaining, pending to play,
  still to watch or yet to buy cover ONLY memories marked "still to do". A
  memory marked "done" has been played, watched, bought or finished, and must
  not be listed or counted among them.
- Questions about what was finished, completed, played, watched or bought
  cover the "done" ones.
- When neither is asked, use both, and say which are done.
- For "how much did I spend", add up only the amounts present, put the total in
  headline, and list each entry in items.
- For "how often do I...", put the typical gap in headline, and list the
  matching events in items. With only one event, say so in answer rather than
  inferring a frequency.`;

/** One compact line per memory. Null fields are omitted rather than sent as "null". */
export function renderMemory(memory: Memory, ref: string): string {
  const date = new Date(memory.eventDate).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // The state matters as much as the title: "what is left to play" and "what
  // have I played" are the same entries read two different ways.
  const state = memory.status === 'active' ? 'still to do' : `${memory.status}`;
  const parts = [
    `[${ref}] ${date} | ${memory.type} | ${memory.category} | ${state}`,
    `title: ${memory.title}`,
  ];

  if (memory.amount !== null) {
    const symbol = CURRENCY_SYMBOLS[memory.currency ?? ''] ?? `${memory.currency ?? ''} `;
    parts.push(`amount: ${symbol}${memory.amount}`);
  }
  if (memory.people) parts.push(`people: ${memory.people}`);
  if (memory.location) parts.push(`location: ${memory.location}`);
  if (memory.tags) parts.push(`tags: ${memory.tags}`);
  if (memory.dateExpression) parts.push(`said: "${memory.dateExpression}"`);
  parts.push(`note: ${memory.rawInput}`);

  return parts.join('\n  ');
}

/**
 * Turn a question the phone could not read into English search words.
 *
 * One short call, and only when on-device retrieval found nothing (see
 * needsTranslation in src/manglish.ts). Returns '' on any failure, which
 * leaves the question to be searched exactly as it was asked.
 */
async function translateToKeywords(question: string): Promise<string> {
  try {
    const answer = await requestText({
      model: ASK_MODEL,
      system:
        'You turn a question into English search keywords. Reply with 3 to 8 words, space separated, nothing else — no sentence, no punctuation.',
      user: question,
      retries: 0,
    });
    return answer.trim().slice(0, 120);
  } catch {
    // Offline or out of quota: search the question as it was asked.
    return '';
  }
}

export function looseJsonParse(raw: string): unknown {
  const text = raw.trim();
  const candidates: string[] = [text];

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next shape
    }
  }
  return null;
}

/**
 * Answer a natural-language question from stored memories, and optionally
 * from an Expense-mode spending snapshot alongside them.
 *
 * @param question       the user's question
 * @param nowISO         used for relative phrases like "last month"
 * @param all            every confirmed memory. The caller owns storage, which
 *                       keeps this module runnable outside React Native.
 * @param history        prior turns in this conversation, oldest first.
 * @param expenseContext an optional pre-built Expense-mode snapshot (e.g. from
 *                       `buildChatContext`), included as a second, independent
 *                       data source. Omitted entirely when not given, so
 *                       callers (and scripts/test-ai.ts) that only have
 *                       memories keep working unchanged.
 */
export async function askAI(
  question: string,
  nowISO: string,
  all: Memory[],
  history: AskTurn[] = [],
  expenseContext?: unknown
): Promise<AskResult> {
  const trimmed = question.trim();
  if (!trimmed) return { answer: '', items: [], headline: null, evidence: [], usedExpenseData: false, found: false };

  const now = new Date(nowISO);
  const hasExpenseData = expenseContext !== undefined && expenseContext !== null;

  if (all.length === 0 && !hasExpenseData) {
    return {
      answer: 'Nothing has been recorded yet. Capture a memory first.',
      items: [],
      headline: null,
      evidence: [],
      usedExpenseData: false,
      found: false,
    };
  }

  // Retrieval and the list check both read the follow-up together with the
  // question before it, so "and movies?" still knows what was being asked.
  const inContext = conversationQuery(trimmed, history);

  let { memories, range, hadKeywordMatch } =
    all.length > 0
      ? selectRelevantMemories(inContext, all, now, MAX_CONTEXT_MEMORIES)
      : { memories: [] as Memory[], range: null, hadKeywordMatch: false };

  // A question in Malayalam script, or in Manglish the glossary has never met,
  // that matched nothing on the phone: worth one cheap call to turn it into
  // English search words, then search again. A question that already found
  // something — or that was plain English — never reaches here, so asking
  // costs exactly what it did before.
  if (all.length > 0 && needsTranslation(normalizeQuery(inContext), hadKeywordMatch ? 1 : 0)) {
    const keywords = await translateToKeywords(inContext);
    if (keywords) {
      const retried = selectRelevantMemories(keywords, all, now, MAX_CONTEXT_MEMORIES);
      if (retried.hadKeywordMatch) {
        memories = retried.memories;
        range = retried.range ?? range;
        hadKeywordMatch = true;
      }
    }
  }

  // "Which games are still to play" is a question about rows, not prose: the
  // phone can answer it exactly and at once, where a model takes seconds,
  // spends quota, and can quietly leave one out. Expense data has no such
  // "pending" concept, so this fast path only ever applies to memories.
  const asList = all.length > 0 ? listQuestion(inContext, range !== null) : null;
  if (asList) {
    const counted = answerFromList(asList, all);
    return {
      answer: counted.answer,
      items: counted.items,
      headline: counted.headline,
      evidence: counted.entries,
      usedExpenseData: false,
      found: counted.entries.length > 0,
    };
  }

  // The named period exists but is empty, and there is no expense data to
  // fall back on either — answerable without a model call.
  if (memories.length === 0 && !hasExpenseData) {
    return {
      answer: `No recorded memory found${range ? ` for ${range.label}` : ''}.`,
      items: [],
      headline: null,
      evidence: [],
      usedExpenseData: false,
      found: false,
    };
  }

  // Ref ids keep the prompt small and give the model something short to cite.
  const byRef = new Map<string, Memory>();
  const rendered = memories.map((memory, index) => {
    const ref = `M${index + 1}`;
    byRef.set(ref, memory);
    return renderMemory(memory, ref);
  });

  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
  const scope =
    memories.length === 0
      ? 'No memories are recorded.'
      : range
        ? `These are the memories recorded during ${range.label}.`
        : `These are the ${memories.length} most relevant of ${all.length} recorded memories.`;

  const body = await requestJson({
    model: getEffectiveAskModel(),
    system: SYSTEM_PROMPT,
    user: [
      `Current local time: ${localTimestamp(nowISO)} (${weekday})`,
      '',
      ...(history.length > 0
        ? [
            'CONVERSATION SO FAR — the question below may refer back to this:',
            '',
            ...history
              .slice(-HISTORY_TURNS)
              .map((turn) => `Q: ${turn.question}\nA: ${turn.answer}`),
            '',
          ]
        : []),
      `MEMORIES — ${scope}`,
      '',
      rendered.join('\n\n'),
      '',
      ...(hasExpenseData
        ? ['EXPENSE DATA — this person\'s recorded spending/income, independent of the memories above:', '', JSON.stringify(expenseContext), '']
        : []),
      `QUESTION: ${trimmed}`,
    ].join('\n'),
    schemaName: 'grounded_answer',
    schema: ANSWER_SCHEMA,
  });

  const parsed = looseJsonParse(body) as
    | {
        found?: unknown;
        answer?: unknown;
        headline?: unknown;
        items?: unknown;
        usedMemoryIds?: unknown;
        usedExpenseData?: unknown;
      }
    | null;

  if (!parsed || typeof parsed.answer !== 'string') {
    return {
      answer: "Couldn't read the answer — try rephrasing the question.",
      items: [],
      headline: null,
      evidence: [],
      usedExpenseData: false,
      found: false,
    };
  }

  const items = Array.isArray(parsed.items)
    ? parsed.items
        .filter((item): item is string => typeof item === 'string')
        // Models like to decorate a list even when asked not to.
        .map((item) => item.replace(/^\s*[-•*–]\s*/, '').trim())
        .filter(Boolean)
    : [];
  const headline =
    typeof parsed.headline === 'string' && parsed.headline.trim().length > 0
      ? parsed.headline.trim()
      : null;

  const refs = Array.isArray(parsed.usedMemoryIds) ? parsed.usedMemoryIds : [];
  const evidence: Memory[] = [];
  const seen = new Set<string>();

  for (const ref of refs) {
    if (typeof ref !== 'string') continue;
    const memory = byRef.get(ref.trim().toUpperCase());
    if (memory && !seen.has(memory.id)) {
      seen.add(memory.id);
      evidence.push(memory);
    }
  }

  const usedExpenseData = parsed.usedExpenseData === true;

  // Treat "answered but cited nothing" as not-found: an answer we cannot show
  // the basis for is exactly the ungrounded output this app must not produce.
  // Citing EXPENSE DATA counts as grounded too, even with no memory evidence.
  const found = parsed.found === true && (evidence.length > 0 || usedExpenseData);

  return {
    answer: found
      ? parsed.answer
      : parsed.found === true
        ? "Found something, but couldn't tie it back to a specific memory or expense record."
        : parsed.answer,
    // A list with nothing behind it would be the ungrounded output this app
    // must not produce, so it goes only with an answer that was traced back.
    items: found ? items : [],
    headline: found ? headline : null,
    evidence,
    usedExpenseData: found ? usedExpenseData : false,
    found,
  };
}
