import type { Memory } from '../types';
import { localTimestamp } from '../format';
import { getEffectiveAskModel, requestJson } from './client';
import { retrieveRelevantContent, buildUnifiedContext, formatEvidence, type EvidenceItem } from '@/sources/multiSourceRetrieval';
import { verifyItemGrounding, type GroundingCheckResult } from '@/sources/chunkLogic';
import { conversationQuery, HISTORY_TURNS, type AskTurn } from './ask';

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

const ENHANCED_SYSTEM_PROMPT = `You answer questions about one person using their recorded data from multiple sources:
1. PERSONAL MEMORIES - things they recorded in their notes
2. EXPENSE DATA - their recorded spending, income, budgets, monthly summaries, and recent expense transactions
3. DOCUMENTS - uploaded PDFs, Word docs, and images they've added
4. WEBSITE DATA - content scraped from websites they're tracking
5. TELEGRAM MESSAGES - messages from Telegram channels they follow

Together these sections are the entire world of things you know about this person. You have no other information about them.

ABSOLUTE RULE: answer ONLY from the data provided in these sections.
- If none of the sections contain the answer, set found=false and say plainly that there is no recorded data for that.
- Do NOT guess, do NOT use outside knowledge not supported by the data, do NOT pad a non-answer with speculation.
- You ARE fully permitted and expected to do math, date arithmetic, duration calculation, and calendar day counts from the dates explicitly recorded in the data.
- The sections are independent records — draw on whichever one (or multiple) actually answers the question.
- Always include all source types you drew facts from in sourcesUsed: ['memory', 'expense', 'document', 'website', 'telegram'].
  * Whenever EXPENSE DATA provides any fact, 'expense' MUST be in sourcesUsed.
- Always list the reference IDs (e.g. "M0", "D0", "W0", "T2") in usedSourceIds for any cited memories, documents, websites, or telegram messages.

COUNTING, COMPLETENESS & OPERATIONAL STATUS RULES (CRITICAL):
- When asked "how many times", "count", "list all", "show all", or for voyages/schedules/lay up/maintenance:
  * Thoroughly examine the entire document and schedule table from the very first date to the very last date.
  * Count and list EVERY valid occurrence. Never stop after finding the first one or two.
  * For "LAY UP", "BUNKERING", "DRY DOCK", or maintenance queries: List EVERY single date the vessel is in lay up across the entire schedule. For example, if MV Lakshadweep Sea is in lay up on 19/10, 20/10, 21/10, and 22/10, list ALL 4 dates explicitly! Never truncate to only 2 dates.
  * In ship schedules, port codes (e.g. BTR for Bitra, AND, KLP, KVT, AGT, AMN, KDM, KLT, CHT, MCY) often appear in multi-port stops (e.g. "KLT CHT BTR" or "BTR CHT KLT"). Every single date and ship cell where the port code appears counts as a voyage/call to that island!
  * List every single occurrence in the items array with its exact date, ship name, and ports.
  * ABSOLUTELY NEVER hallucinate or invent dates. Every listed item MUST match an actual date and cell in the text.
  * If a follow-up asks "Show all", "Only X? There is another", or challenges the count, re-verify every row in the schedule and output the complete list.

WHEN THE ANSWER IS PRESENT — this is read on a phone, so answer as a list, not a paragraph:
- answer: ONE short sentence. E.g. "MV Lakshadweep Sea is in lay up on 4 dates from 19/10/26 to 22/10/26." or "MV Lagoons has a 3-day voyage from Kochi to Agatti departing 26/10/26."
  Never a long paragraph, never a restatement of the question.
- headline: the single figure asked for, written as it should be read — a total ("₹4,300"), a count ("4 dates"), a date ("26 October 2026"), duration ("3 days"). Null when the question does not ask for one figure.
- items: one line per thing, chronological order for voyages, each one short and factual in the form "26/10/26 · MV LAGOONS · KOCHI Dept.1430". Include every record you used. No bullet characters.
- Quote concrete dates, times, amounts, and names rather than paraphrasing vaguely.
- When answering from documents, mention the document filename.

FOR LAKSHADWEEP SHIP SCHEDULES & VOYAGE TABLES:
- Island port codes & aliases:
  * AND = Androth / Andrott
  * KLP = Kalpeni
  * KVT = Kavaratti
  * AGT = Agatti
  * AMN = Amini
  * KDM = Kadmat / Kadmath
  * KLT = Kiltan
  * CHT = Chetlat
  * BTR = Bitra
  * MCY = Minicoy
  * KOCHI / COCHIN / COK / KOCHI (LSG) = Kochi port (LSG = Local Service / Passenger)
- Ships: MV A/SEA (Arabian Sea), MV L/SEA or M V / L SEA (Lakshadweep Sea), MV LAGOONS, MV CORALS. Each ship has its own dedicated column across dates.

- WHAT IS A COMPLETE VOYAGE (CRITICAL):
  A ship voyage is NOT a single day or a single cell! A complete voyage is the entire round-trip circuit down that ship's column:
  1. Starts with departure from Kochi (e.g. "KOCHI Dept.1430").
  2. Visits islands on intermediate days with arrival/departure timings (e.g. "KVT AGT 0800-1100. 1400-1600").
  3. Concludes with arrival back at Kochi (e.g. "KOCHI Arr.0700").
  WHEN ASKED ABOUT A VOYAGE ON A DATE OR OF A SHIP (e.g. "What is voyage on 27 october of Lakshadweep sea"):
  * Look under the ship's timeline under "=== EXTRACTED VOYAGE TIMELINES PER VESSEL ===" for that specific vessel!
  * NEVER combine text from adjacent columns on the same row! For example, on 27/10/26 MV L/Sea departs Kochi, and its next stops down its own column are KLT CHT (28/10) and BTR CHT KLT (29/10) returning 30/10. It does NOT go to Agatti (Agatti on 27/10 is in MV Lagoons's column)!
  * ALWAYS output the FULL COMPLETE VOYAGE: from Kochi departure, through all island stops with times, until the ship arrives back at Kochi!
  * In the items array, list every leg of that voyage chronologically:
    1. 27/10/26 · M V / L SEA · KOCHI Dept.1430
    2. 28/10/26 · M V / L SEA · KLT CHT 0800-1100. 1400-1700
    3. 29/10/26 · M V / L SEA · BTR CHT KLT 0700-0830 1100-1330 1530-1430
    4. 30/10/26 · M V / L SEA · KOCHI Arr.0700

- DIRECT AND INDIRECT VOYAGES (CRITICAL):
  When asked for a voyage from one place to another (e.g. "Next voyage of cok to amn", "cok to agt", "kvt to agt"):
  * ALWAYS compare departure dates with "Current local time" above! A departure in the past (e.g. 17/10/26 when today is 25/10/26) is in the past and MUST NEVER be listed as the "next" voyage! Only consider departures strictly on or after today.
  * Direct Voyage: A vessel departing origin and calling at destination on that same voyage.
    - E.g. For Kochi to Amini (AMN): MV Corals departs Kochi 26/10/26 at 12:30 -> calls at KDM AMN on 27/10/26.
    - E.g. For Kochi to Agatti (AGT): MV Lagoons departs Kochi 26/10/26 at 14:30 -> calls at KVT AGT on 27/10/26.
  * Indirect / Connecting Voyage: Traveling via an intermediate hub island or connecting ship.
    - E.g. For Kochi to Amini: Take MV Lagoons on 26/10/26 to Kavaratti (KVT), then connect to Amini via inter-island vessel.
  * When answering, clearly show BOTH the direct voyage(s) and any indirect/via options, including all leg dates, ship names, and times.

- RETURN & ROUND-TRIP VOYAGES (CRITICAL):
  When the user asks for a voyage AND return (e.g. "KVT to AGT then return also", "Kochi to Agatti and return"):
  * Forward leg: Find the date and ship where origin goes to destination (e.g. on 27/10/26 MV Lagoons calls at "KVT AGT" - departs Kavaratti morning, reaches Agatti afternoon).
  * Return leg: Search subsequent dates across ALL ships for the reverse call (e.g. "AGT KVT" - departs Agatti, reaches Kavaratti). E.g. on 01/11/26 MV A/SEA has "AGT KVT 0800-1100. 1400-1600", and on 05/11/26 MV CORALS has "AGT KVT 0800-1100. 1400-1600".
  * List BOTH the forward leg(s) and return leg(s) clearly in the items!

- VOYAGE DURATION & "HOW MANY DAYS":
  When asked "How many days?", "How long?", "Duration":
  * Calculate the calendar days from the departure date to the return date (e.g. Departure 26/10/26, return 28/10/26 = 3 days / 2 nights).
  * Set headline to the duration (e.g. "3 days") and answer explaining the departure date, intermediate dates, and arrival date.

- CONVERSATIONAL FOLLOW-UPS:
  Questions like "Show all", "How many days?", "And return?", "What about next week?" refer to the ship/topic discussed in previous turns. Use the document context already present to provide the full answer.

LANGUAGE:
- Answer in the same language and script the question used. A question in Malayalam script is answered in Malayalam script; Manglish in Manglish; English in English. Dates, amounts, and names stay exactly as recorded.`;

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

    const reply = JSON.parse(raw || '{}');
    const allEvidence = formatEvidence(retrieval);

    const usedIds = new Set(reply.usedSourceIds || []);
    let citedEvidence = allEvidence.filter((e) => usedIds.has(e.refId));

    let sourcesUsed: Array<'memory' | 'expense' | 'document' | 'website' | 'telegram'> = Array.isArray(
      reply.sourcesUsed
    )
      ? reply.sourcesUsed
      : [];

    // Fallback: If model found the answer from context but omitted explicit reference IDs
    // (very common in follow-up questions like "Show all", "How many days?", "And return?"),
    // preserve the retrieved document evidence so valid answers are never wiped out.
    if (reply.found && citedEvidence.length === 0 && allEvidence.length > 0) {
      citedEvidence = allEvidence.slice(0, 3);
      for (const e of citedEvidence) {
        if (!sourcesUsed.includes(e.type)) {
          sourcesUsed.push(e.type);
        }
      }
    }

    const isExpenseUsed = sourcesUsed.includes('expense');
    const found = Boolean(reply.found) && (citedEvidence.length > 0 || isExpenseUsed || allEvidence.length > 0);

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

    return {
      answer: found
        ? (reply.answer || 'Found relevant records.')
        : (reply.answer || 'Nothing in your record matches this.'),
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
