/**
 * Enhanced AI Ask with multi-source support (memories + expenses + documents + websites + telegram).
 */
import type { Memory } from '../types';
import { localTimestamp } from '../format';
import { ASK_MODEL, requestJson } from './client';
import { retrieveRelevantContent, buildUnifiedContext, formatEvidence, type EvidenceItem } from '@/sources/multiSourceRetrieval';
import { conversationQuery, HISTORY_TURNS, type AskTurn } from './ask';

export interface EnhancedAskResult {
  /** One short sentence: the answer itself. */
  answer: string;
  /** The things the answer is made of, one per line. */
  items: string[];
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
- Always list the reference IDs (e.g. "M0", "D1", "W0", "T2") in usedSourceIds for any cited memories, documents, websites, or telegram messages.

WHEN THE ANSWER IS PRESENT — this is read on a phone, so answer as a list, not a paragraph:
- answer: ONE short sentence. E.g. "You spent ₹4,300 on tickets." or "You spent ₹18,450 this month."
  Never a paragraph, never a restatement of the question.
- headline: the single figure asked for, written as it should be read — a total ("₹4,300"), a count ("6 times"), a date ("24 October 2026"). Null when the question does not ask for one figure.
- items: one line per thing, newest first, each one short and factual in the form "24 Oct · Train ticket · ₹1,200". Include every record you used. No sentences, no commentary, no bullet characters.
- Quote concrete dates, amounts, and names rather than paraphrasing vaguely.
- When answering from documents, mention the document filename.
- When answering from websites or Telegram, mention the title or channel.

FOR LAKSHADWEEP SHIP SCHEDULES & VOYAGE TABLES:
- Island port codes used in Lakshadweep ship schedules:
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
- In voyage schedules, a ship's departure from Kochi (e.g., "KOCHI Dept.1800") followed on the next day by island codes (e.g., "AND KLP 0800-1100") means that ship leaves Kochi for Androth.
- When the user asks for the "next" ship, compare the schedule dates with the "Current local time" provided above and pick the soonest upcoming departure on or after today's date (never suggest a past date as the next ship). State the vessel name, departure date, departure time from Kochi, and arrival time at the destination island.

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
  const context = buildUnifiedContext(retrieval, expenseContext);

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
      model: ASK_MODEL,
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

    return {
      answer: found
        ? (reply.answer || 'Found relevant records.')
        : (reply.answer || 'Nothing in your record matches this.'),
      items: found ? items : [],
      headline: found ? headline : null,
      evidence: citedEvidence,
      sourcesUsed: found ? sourcesUsed : [],
      found,
    };
  } catch (err) {
    throw new Error(`Enhanced ask failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
