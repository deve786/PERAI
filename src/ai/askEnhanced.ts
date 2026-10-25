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
- Do NOT guess, do NOT use general or outside knowledge, do NOT pad a non-answer with speculation.
- The sections are independent records — draw on whichever one (or multiple) actually answers the question.
- Always include all source types you drew facts from in sourcesUsed: ['memory', 'expense', 'document', 'website', 'telegram'].
  * Whenever EXPENSE DATA provides any fact, 'expense' MUST be in sourcesUsed.
- Always list the reference IDs (e.g. "M0", "D0", "W0", "T2") in usedSourceIds for any cited memories, documents, websites, or telegram messages.

COUNTING & COMPLETENESS RULES (CRITICAL):
- When asked "how many times", "count", "list all", or for voyages/schedules/events:
  * Thoroughly examine the entire document and schedule table from the very first date to the very last date.
  * Count EVERY valid occurrence. Never stop after finding the first one or two.
  * In ship schedules, port codes (e.g. BTR for Bitra, AND, KLP, KVT, AGT, AMN, KDM, KLT, CHT, MCY) often appear in multi-port stops (e.g. "KLT CHT BTR" or "BTR CHT KLT"). Every single date and ship cell where the port code appears counts as a voyage/call to that island!
  * List every single occurrence in the items array with its exact date, ship name, and ports.
  * ABSOLUTELY NEVER hallucinate, invent, or duplicate dates or voyages. Every listed item MUST match an actual date and row in the text.
  * If a follow-up asks "Only X times? There is another" or challenges the count, re-verify every row in the schedule. If there is another genuine occurrence in the text, include it. If there are no other occurrences in the text, reaffirm the exact genuine occurrences found and do NOT fabricate dates to please the user.

WHEN THE ANSWER IS PRESENT — this is read on a phone, so answer as a list, not a paragraph:
- answer: ONE short sentence. E.g. "You had 3 voyage entries referencing Bitra in the ship schedule." or "You spent ₹18,450 this month."
  Never a paragraph, never a restatement of the question.
- headline: the single figure asked for, written as it should be read — a total ("₹4,300"), a count ("3 times"), a date ("24 October 2026"). Null when the question does not ask for one figure.
- items: one line per thing, newest first, each one short and factual in the form "06/11/26 · MV LAGOONS · BTR CHT KLT". Include every record you used. No sentences, no commentary, no bullet characters.
- Quote concrete dates, amounts, and names rather than paraphrasing vaguely.
- When answering from documents, mention the document filename.
- When answering from websites or Telegram, mention the title or channel.

FOR LAKSHADWEEP SHIP SCHEDULES & VOYAGE TABLES:
- Island port codes:
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
- Island voyages / calls:
  Whenever an island code (e.g. BTR) appears in a ship's schedule cell on a given date, that ship calls at / voyages to that island on that date.
- HOW TO TRACE A VOYAGE (CRITICAL):
  Each ship (MV A/SEA, MV L/SEA, MV LAGOONS, MV CORALS) has its own dedicated column across dates.
  A voyage from Kochi to an island consists of:
  * A cell with "KOCHI Dept.[time]" in that ship's column.
  * The NEXT cell in the SAME column on the following day listing the destination island code (e.g. "AND" or "AGT").
  When the user asks for the NEXT ship from Kochi to an island, find the earliest departure from Kochi on or after "Current local time" whose immediate next stop in the same ship's column is that island.
  - For Agatti (AGT):
    * On 25/10/26, MV A/SEA departs Kochi at 1430, but visits KLT CHT (Kiltan & Chetlat) on 26/10 — it does NOT go to Agatti!
    * On 26/10/26, MV Lagoons has "KOCHI Dept.1430" and on 27/10/26 it has "KVT AGT" (Kavaratti & Agatti). So the next ship from Kochi to Agatti is MV Lagoons on 26 October 2026 at 14:30!
  - For Androth (AND):
    * On 29/10/26, MV Lagoons has "KOCHI Dept.1800" and on 30/10/26 it has "AND KLP" (Androth & Kalpeni). So the next ship from Kochi to Androth is MV Lagoons on 29 October 2026 at 18:00!
  Never connect a Kochi departure from one ship with an island code from a different ship column or different day!

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
    const citedEvidence = allEvidence.filter((e) => usedIds.has(e.refId));

    const sourcesUsed: Array<'memory' | 'expense' | 'document' | 'website' | 'telegram'> = Array.isArray(
      reply.sourcesUsed
    )
      ? reply.sourcesUsed
      : [];

    const isExpenseUsed = sourcesUsed.includes('expense');
    const found = Boolean(reply.found) && (citedEvidence.length > 0 || isExpenseUsed);

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
