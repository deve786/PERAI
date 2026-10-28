import type { Memory } from '../types';
import { localTimestamp } from '../format';
import { getEffectiveAskModel, requestJson } from './client';
import {
  retrieveRelevantContent,
  buildUnifiedContext,
  formatEvidence,
  formatToIST,
  type EvidenceItem,
} from '@/sources/multiSourceRetrieval';
import { verifyItemGrounding, type GroundingCheckResult } from '@/sources/chunkLogic';
import { answerFromList, listQuestion } from '../listQuestion';
import { guessDateRange } from './retrieval';
import { conversationQuery, HISTORY_TURNS, looseJsonParse, type AskTurn } from './ask';

export interface EnhancedAskResult {
  /** One short sentence: the answer itself. */
  answer: string;
  /** The things the answer is made of, one per line. */
  items: string[];
  /** Verification status for each item against the source context to flag hallucinations. */
  itemStatuses?: GroundingCheckResult[];
  /** A figure the question asked for, shown large above the list. */
  headline: string | null;
  /** All evidence items across all sources. */
  evidence: EvidenceItem[];
  /** Which sources were actually used in the answer. */
  sourcesUsed: Array<'memory' | 'expense' | 'document' | 'website' | 'telegram'>;
  /** False when nothing relevant was found. */
  found: boolean;
}

const ENHANCED_ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    found: {
      type: 'boolean',
      description: 'True only if the provided data sources actually answer the question.',
    },
    answer: { type: 'string', description: 'One short sentence answering the question.' },
    headline: {
      type: ['string', 'null'],
      description: 'The single figure the question asked for — a total (e.g. "₹4,300"), a count ("3 times"), a date — or null.',
    },
    items: {
      type: 'array',
      description: 'One line per thing the answer covers, newest first. Each line is short and factual.',
      items: { type: 'string' },
    },
    usedSourceIds: {
      type: 'array',
      description: 'The reference ids used (e.g. "M3", "D1", "W0", "T2"). Empty if only expense data was used.',
      items: { type: 'string' },
    },
    sourcesUsed: {
      type: 'array',
      description: 'Which source types were actually used: memory, expense, document, website, telegram.',
      items: { type: 'string', enum: ['memory', 'expense', 'document', 'website', 'telegram'] },
    },
  },
  required: ['found', 'answer', 'headline', 'items', 'usedSourceIds', 'sourcesUsed'],
  additionalProperties: false,
};

const ENHANCED_SYSTEM_PROMPT = `You answer questions about one person using their own recorded data, from these sources:
1. PERSONAL MEMORIES — notes, tasks, reminders and events they captured
2. EXPENSE DATA — their recorded spending, income, budgets and monthly summaries
3. DOCUMENTS — PDFs, Word files, text files and images they uploaded
4. WEBSITE DATA — content scraped from sites they track
5. TELEGRAM MESSAGES — messages from channels they follow

Together these sections are the entire world of things you know about this
person. You have no other information about them.

ABSOLUTE RULE: answer ONLY from the sections given in the user message.
- Every date, time, amount, name and figure you state must appear in those
  sections, or follow by arithmetic from figures that do. Never supply one from
  general knowledge, and never carry one over from an example in these
  instructions — the examples here describe shapes, never facts.
- If the sections do not contain the answer, set found=false and say plainly
  that there is nothing recorded for it. Do not guess, do not reason from what
  people usually do, and do not pad a non-answer with speculation.
- You ARE expected to do arithmetic, date arithmetic, durations and calendar
  day counts over figures and dates that are recorded.
- The sections are independent records, not copies of each other. Draw on
  whichever ones answer the question; none outranks the others.
- List the reference id of everything you used in usedSourceIds, in the order
  you relied on it (e.g. "M0", "D0", "W0", "T2"), and name every source type
  you drew a fact from in sourcesUsed. Whenever EXPENSE DATA supplied any
  fact, 'expense' must be in sourcesUsed. If found=false, usedSourceIds and
  sourcesUsed must both be empty.
- A section header may say that only part of what matched is shown. When it
  does, do not present a total or a count over it as the complete figure; say
  what it covers.

MEMORY STATE — every memory says whether it is "still to do" or "done":
- Questions about what is pending, waiting, left, remaining, still to watch,
  yet to buy or yet to play cover ONLY memories marked "still to do". A memory
  marked done has been watched, bought, played or finished and must not be
  listed or counted among them.
- Questions about what was finished, completed, watched, bought or played
  cover the done ones.
- When neither is asked, cover both and say which are done.

COUNTING AND COMPLETENESS:
- For "how many times", "count", "list all", "show all", and for any schedule,
  voyage, lay-up, bunkering or maintenance question, read the whole of the
  relevant section from its first row to its last before answering.
- List EVERY occurrence that matches, each with its own line. Never stop at the
  first one or two, and never truncate a list you were asked to complete.
- In a schedule table, a port code often appears in a multi-port cell (several
  codes in one cell). Every date and cell where the code appears counts as a
  call at that port.
- Never invent a date, time or row. Every line you output must correspond to an
  actual cell in the text you were given.
- If a follow-up challenges your count or asks to see all of them, re-read
  every row and give the complete list rather than repeating the short one.

WHEN THE ANSWER IS PRESENT — this is read on a phone, so answer as a list, not
a paragraph:
- answer: ONE short sentence. Never a paragraph, never a restatement of the
  question.
- headline: the single figure asked for, written as it should be read — a total,
  a count, a date, a duration. Null when the question does not ask for one
  figure.
- items: one line per thing, short and factual, in the form
  "<date> · <what it was> · <figure or detail>". Chronological for schedules and
  voyages, newest first otherwise. Include everything you used and nothing you
  did not. No bullet characters, no commentary.
- Quote concrete dates, times, amounts and names as they are recorded rather
  than paraphrasing. Say the date, not "recently".
- When the answer comes from a document, name the document.

LAKSHADWEEP SHIP SCHEDULES AND VOYAGE TABLES — these apply only when such a
schedule is actually present in the sections above:
- Island port codes: AND = Androth/Andrott, KLP = Kalpeni, KVT = Kavaratti,
  AGT = Agatti, AMN = Amini, KDM = Kadmat/Kadmath, KLT = Kiltan,
  CHT = Chetlat, BTR = Bitra, MCY = Minicoy. KOCHI / COCHIN / COK is Kochi
  port (LSG marks the local service).
- Vessels: MV A/SEA (Arabian Sea), MV L/SEA or M V / L SEA (Lakshadweep Sea),
  MV LAGOONS, MV CORALS. Each vessel has its own column across the dates.
- "####" or "#" in a cell means lay up / in port / idle: the vessel does NOT
  sail that day. Never count or list it as a departure or a voyage.
- A voyage is not one cell. It is the whole circuit down one vessel's own
  column: departure from Kochi ("KOCHI Dept." with a time), the island calls on
  the intermediate days with their timings, and the arrival back at Kochi
  ("KOCHI Arr." with a time). Report the full circuit, leg by leg.
- NEVER read across a row into another vessel's column. A cell belongs to the
  vessel whose column it sits in, on the date of its row. Follow one column
  down; that alone is the voyage.
- Where the context lists "EXTRACTED VOYAGE TIMELINES PER VESSEL", use the
  timeline for the vessel asked about.
- "Next" means next relative to the "Current local time" given at the top of
  the user message. A departure before that date is in the past and must never
  be offered as the next one.
- Asked for all voyages between two places: check every vessel across the whole
  schedule, and number each complete voyage as one item, giving its dates, the
  vessel, and its legs. The headline is how many voyages there are.
- Direct voyage: one vessel departs the origin and calls at the destination on
  the same circuit. Indirect: the journey connects through an intermediate
  island or a second vessel. When both exist, give both, with every leg's date,
  vessel and times.
- Asked for a return as well: find the forward leg, then search the later dates
  across all vessels for the reverse call, and list both legs.
- "Where is the vessel now": compare the current date AND time with the
  schedule, and read any Telegram messages alongside it. A vessel that has
  departed but whose next arrival is still ahead is at sea — the headline is
  "At sea (en route to X)", never the island it has not reached. Within a
  port's working hours on a date it calls, it is berthed there. After arriving
  at Kochi and before its next departure, it is at Kochi.
- Duration: count the calendar days from the departure date to the arrival back,
  inclusive, and put that in headline.
- Asked about the contents of an attached file whose itemised rows are not in
  the context: say which vessel, date and document it concerns, give every fact
  the message does carry, and say that the full list is in the attached PDF,
  which can be opened in Telegram or uploaded on the Documents tab. Never
  answer with a bare filename.

FOLLOWING ON — when a conversation is given, the question may lean on it:
- "and the month before?", "show all", "how many days?", "and the return?" mean
  the earlier question again with one thing changed. Work out the full question
  first, then answer that one, not the earlier one.
- Never repeat the previous answer unless it is genuinely the answer to this
  question too.
- The recorded sections, not the conversation, remain the only source of fact.

LANGUAGE — answer in the same language and script the question used. A question
in Malayalam script is answered in Malayalam script; one in romanised Malayalam
(Manglish) is answered the same way; an English question in English. Dates,
amounts and names stay exactly as they are recorded. The citation rules do not
change.`;

export async function askAIEnhanced(
  question: string,
  nowISO: string,
  allMemories: Memory[],
  history: AskTurn[] = [],
  expenseContext?: unknown
): Promise<EnhancedAskResult> {
  const trimmed = question.trim();
  if (!trimmed) {
    return {
      answer: '',
      items: [],
      headline: null,
      evidence: [],
      sourcesUsed: [],
      found: false,
    };
  }

  const now = new Date(nowISO);
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
  const timeHeader = `Current local time: ${localTimestamp(nowISO)} (${weekday})`;

  const searchQuery = conversationQuery(trimmed, history);

  // "Which games are still to play" is a question about rows, not prose: the
  // phone answers it exactly and at once, where a model takes seconds, spends
  // quota, and can quietly leave one out or count a finished entry among the
  // pending ones. This is the same fast path the single-source ask has always
  // had; routing every question through the model lost it.
  if (allMemories.length > 0) {
    const dated = guessDateRange(searchQuery, now) !== null;
    const asList = listQuestion(searchQuery, dated);
    if (asList) {
      const counted = answerFromList(asList, allMemories);
      return {
        answer: counted.answer,
        items: counted.items,
        itemStatuses: counted.items.map(() => ({ verified: true })),
        headline: counted.headline,
        evidence: counted.entries.map((entry, index) => ({
          refId: `M${index}`,
          type: 'memory' as const,
          id: entry.id,
          title: entry.title,
          subtitle: formatToIST(entry.eventDate),
          sourceKind: 'memory' as const,
          badgeLabel: '🧠 Memory',
          content: entry.rawInput,
          metadata: { category: entry.category, type: entry.type },
        })),
        sourcesUsed: counted.entries.length > 0 ? ['memory'] : [],
        found: counted.entries.length > 0,
      };
    }
  }

  const retrieval = await retrieveRelevantContent(searchQuery, nowISO, allMemories);
  const context = buildUnifiedContext(retrieval, expenseContext, trimmed);

  const recentHistory = history.slice(-HISTORY_TURNS);
  let historyPrompt = '';
  if (recentHistory.length > 0) {
    historyPrompt = '\n\nPREVIOUS CONVERSATION:\n';
    for (const turn of recentHistory) {
      historyPrompt += `Q: ${turn.question}\nA: ${turn.answer}\n`;
    }
  }

  const userMessage = `${timeHeader}\n\n${context}${historyPrompt}\n\nQUESTION: ${trimmed}\n\nAnswer strictly from the data provided above. Cite source IDs and include all sourcesUsed.`;

  try {
    const raw = await requestJson({
      model: getEffectiveAskModel(),
      system: ENHANCED_SYSTEM_PROMPT,
      user: userMessage,
      schemaName: 'enhanced_answer',
      schema: ENHANCED_ANSWER_SCHEMA,
    });

    // A reply can come back fenced in ``` or with a stray prefix even under a
    // schema. JSON.parse threw on those and took the whole question down with
    // it, so it is read the same forgiving way the single-source path reads it.
    const reply = (looseJsonParse(raw || '{}') ?? {}) as {
      found?: unknown;
      answer?: unknown;
      headline?: unknown;
      items?: unknown;
      usedSourceIds?: unknown;
      sourcesUsed?: unknown;
    };
    const allEvidence = formatEvidence(retrieval);

    const usedIds = new Set(Array.isArray(reply.usedSourceIds) ? reply.usedSourceIds : []);
    let citedEvidence = allEvidence.filter((e) => usedIds.has(e.refId));

    const SOURCE_TYPES = ['memory', 'expense', 'document', 'website', 'telegram'] as const;
    type SourceType = (typeof SOURCE_TYPES)[number];
    const sourcesUsed: SourceType[] = (Array.isArray(reply.sourcesUsed) ? reply.sourcesUsed : []).filter(
      (s): s is SourceType => SOURCE_TYPES.includes(s as SourceType)
    );

    // A follow-up ("Show all", "And return?", "How many days?") often answers
    // from context without repeating the reference ids. Rather than guess, fall
    // back to the sources the model did name, so the evidence shown is at least
    // of the right kind. The old fallback attached the top three retrieved items
    // whatever they were, which put unrelated cards under the answer and made a
    // wrong answer look sourced.
    if (reply.found === true && citedEvidence.length === 0 && sourcesUsed.length > 0) {
      citedEvidence = allEvidence.filter((e) => sourcesUsed.includes(e.type)).slice(0, 5);
    }

    const isExpenseUsed = sourcesUsed.includes('expense');
    // Grounding, not mere retrieval: "something was retrieved" is not evidence
    // that the answer came from it, and treating it as such let every
    // ungrounded answer through as found.
    const found = reply.found === true && (citedEvidence.length > 0 || isExpenseUsed);

    const items = Array.isArray(reply.items)
      ? reply.items
          .filter((item: unknown): item is string => typeof item === 'string')
          .map((item: string) => item.replace(/^\s*[-•*–]\s*/, '').trim())
          .filter(Boolean)
      : [];

    const headline =
      typeof reply.headline === 'string' && reply.headline.trim().length > 0
        ? reply.headline.trim()
        : null;

    const itemStatuses = found ? items.map((item: string) => verifyItemGrounding(item, context)) : [];

    const spoken = typeof reply.answer === 'string' && reply.answer.trim().length > 0 ? reply.answer.trim() : null;

    return {
      answer: found
        ? (spoken ?? 'Found relevant records.')
        : reply.found === true
          ? // It claims an answer but cannot point at what it came from, which is
            // exactly the ungrounded output this app must not present as fact.
            "Found something, but couldn't tie it back to a specific record."
          : (spoken ?? 'Nothing in your record matches this.'),
      items: found ? items : [],
      itemStatuses: found ? itemStatuses : [],
      headline: found ? headline : null,
      evidence: citedEvidence,
      sourcesUsed: found ? sourcesUsed : [],
      found,
    };
  } catch (err) {
    throw new Error(`Enhanced ask failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
