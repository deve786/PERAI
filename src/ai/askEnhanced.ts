/**
 * Enhanced AI Ask with multi-source support (memories + expenses + documents + websites + telegram).
 */
import type { Memory } from '../types';
import type { ExpenseRow } from '@/expense/db';
import { ASK_MODEL, getClient } from './client';
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
      description: 'The single figure the question asked for — a total, a count, a date — or null.',
    },
    items: {
      type: 'array',
      description: 'One line per thing the answer covers, newest first. Each line is short and factual.',
      items: { type: 'string' },
    },
    usedSourceIds: {
      type: 'array',
      description: 'The reference ids used (e.g. "M3", "D1", "W0", "T2").',
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
2. EXPENSE DATA - their spending and income records
3. DOCUMENTS - uploaded PDFs, Word docs, and images they've added
4. WEBSITE DATA - content scraped from websites they're tracking
5. TELEGRAM MESSAGES - messages from Telegram channels they follow

ABSOLUTE RULE: answer ONLY from the data provided in these five sections.

- If none of the sections contain the answer, set found=false and say plainly that there is no data for that.
- Do NOT guess, do NOT use general knowledge, do NOT pad a non-answer with speculation.
- Each section is independent — use whichever ones actually answer the question.
- Always cite which sources you used by including their reference IDs (M0, D1, W0, T2, etc.).
- When answering from documents, mention which document and page if available.
- When answering from websites, mention the website name or URL.
- When answering from Telegram, mention the channel name.
- Preserve dates, amounts, and facts exactly as recorded.

Answer briefly and factually. If data exists across multiple sources, synthesize it.`;

export async function askAIEnhanced(
  question: string,
  nowISO: string,
  allMemories: Memory[],
  history: AskTurn[] = [],
  expenseContext?: string
): Promise<EnhancedAskResult> {
  const searchQuery = conversationQuery(question, history);
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

  const userMessage = `${context}${historyPrompt}

CURRENT QUESTION: ${question}

Answer from the data provided above. Cite source IDs you use.`;

  try {
    const client = getClient();
    const response = await client.models.generateContent({
      model: ASK_MODEL,
      config: {
        systemInstruction: ENHANCED_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: ENHANCED_ANSWER_SCHEMA,
      },
      contents: userMessage,
    });

    const reply = JSON.parse(response.text || '{}');
    const allEvidence = formatEvidence(retrieval);

    const usedIds = new Set(reply.usedSourceIds || []);
    const citedEvidence = allEvidence.filter(e => usedIds.has(e.refId));

    const sourcesUsed: Array<'memory' | 'expense' | 'document' | 'website' | 'telegram'> = Array.isArray(reply.sourcesUsed)
      ? reply.sourcesUsed
      : [];

    return {
      answer: reply.answer || 'No relevant information found.',
      items: Array.isArray(reply.items) ? reply.items : [],
      headline: reply.headline || null,
      evidence: citedEvidence,
      sourcesUsed,
      found: Boolean(reply.found),
    };
  } catch (err) {
    throw new Error(`Enhanced ask failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
