/**
 * Enhanced retrieval across all data sources.
 */
import type { Memory } from '@/types';
import type { ExpenseRow } from '@/expense/db';
import type { DocumentChunk, TelegramMessage, WebsiteData } from './types';
import { searchDocumentChunks } from './documents';
import { searchWebsiteContent } from './websites';
import { searchTelegramMessages } from './telegram';
import { selectRelevantMemories } from '@/ai/retrieval';

export interface MultiSourceContext {
  memories: Memory[];
  expenses: ExpenseRow[];
  documentChunks: DocumentChunk[];
  websites: WebsiteData[];
  telegramMessages: TelegramMessage[];
}

export interface RetrievalResult {
  memories: Memory[];
  documentChunks: DocumentChunk[];
  websites: WebsiteData[];
  telegramMessages: TelegramMessage[];
}

/**
 * Retrieve relevant content from all sources based on a question.
 */
export async function retrieveRelevantContent(
  question: string,
  nowISO: string,
  allMemories: Memory[],
  options: {
    maxMemories?: number;
    maxDocuments?: number;
    maxWebsites?: number;
    maxTelegram?: number;
  } = {}
): Promise<RetrievalResult> {
  const {
    maxMemories = 100,
    maxDocuments = 50,
    maxWebsites = 10,
    maxTelegram = 50,
  } = options;

  // Retrieve from all sources in parallel
  const [memoryResult, documentChunks, websites, telegramMessages] = await Promise.all([
    Promise.resolve(selectRelevantMemories(question, nowISO, allMemories, { limit: maxMemories })),
    searchDocumentChunks(question, maxDocuments).catch(() => []),
    searchWebsiteContent(question, maxWebsites).catch(() => []),
    searchTelegramMessages(question, maxTelegram).catch(() => []),
  ]);

  return {
    memories: memoryResult.memories,
    documentChunks,
    websites,
    telegramMessages,
  };
}

/**
 * Build unified context string for AI prompt.
 */
export function buildUnifiedContext(result: RetrievalResult, expenseContext?: string): string {
  let context = '';

  // Memories section
  if (result.memories.length > 0) {
    context += '\n\n=== YOUR PERSONAL MEMORIES ===\n';
    result.memories.forEach((m, i) => {
      const people = m.people ? ` | People: ${m.people}` : '';
      const location = m.location ? ` | Location: ${m.location}` : '';
      const amount = m.amount !== null ? ` | Amount: ${m.currency || '₹'}${m.amount}` : '';
      context += `[M${i}] ${m.title} (${m.eventDate})${people}${location}${amount}\n`;
      if (m.rawInput && m.rawInput !== m.title) {
        context += `  Note: ${m.rawInput}\n`;
      }
    });
  }

  // Expense context from Money data
  if (expenseContext) {
    context += '\n\n=== YOUR EXPENSE DATA ===\n';
    context += expenseContext;
  }

  // Document chunks section
  if (result.documentChunks.length > 0) {
    context += '\n\n=== DOCUMENTS ===\n';
    result.documentChunks.forEach((d, i) => {
      const page = d.pageNumber ? ` (page ${d.pageNumber})` : '';
      context += `[D${i}] From "${d.filename}"${page}:\n`;
      context += `${d.content.substring(0, 800)}${d.content.length > 800 ? '...' : ''}\n\n`;
    });
  }

  // Website data section
  if (result.websites.length > 0) {
    context += '\n\n=== WEBSITE DATA ===\n';
    result.websites.forEach((w, i) => {
      context += `[W${i}] From ${w.url}${w.title ? ` - ${w.title}` : ''}:\n`;
      context += `${w.content.substring(0, 800)}${w.content.length > 800 ? '...' : ''}\n\n`;
    });
  }

  // Telegram messages section
  if (result.telegramMessages.length > 0) {
    context += '\n\n=== TELEGRAM CHANNEL MESSAGES ===\n';
    result.telegramMessages.forEach((t, i) => {
      context += `[T${i}] ${t.channelName || 'Channel'} (${t.messageDate}):\n`;
      context += `${t.messageText || '[Media message]'}\n`;
    });
  }

  return context;
}

/**
 * Format evidence for display in Ask tab.
 */
export interface EvidenceItem {
  type: 'memory' | 'document' | 'website' | 'telegram';
  id: string;
  title: string;
  subtitle: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

export function formatEvidence(result: RetrievalResult): EvidenceItem[] {
  const evidence: EvidenceItem[] = [];

  // Add memory evidence
  for (const m of result.memories) {
    evidence.push({
      type: 'memory',
      id: m.id,
      title: m.title,
      subtitle: m.eventDate,
      content: m.rawInput,
      metadata: { category: m.category, type: m.type },
    });
  }

  // Add document evidence
  for (const d of result.documentChunks) {
    evidence.push({
      type: 'document',
      id: d.id,
      title: d.filename || 'Document',
      subtitle: d.pageNumber ? `Page ${d.pageNumber}` : `Chunk ${d.chunkIndex}`,
      content: d.content.substring(0, 200),
      metadata: { documentId: d.documentId },
    });
  }

  // Add website evidence
  for (const w of result.websites) {
    evidence.push({
      type: 'website',
      id: w.id,
      title: w.title || w.url,
      subtitle: new URL(w.url).hostname,
      content: w.content.substring(0, 200),
      metadata: { url: w.url },
    });
  }

  // Add telegram evidence
  for (const t of result.telegramMessages) {
    evidence.push({
      type: 'telegram',
      id: t.id,
      title: t.channelName || 'Telegram',
      subtitle: t.messageDate,
      content: t.messageText || '[Media message]',
      metadata: { messageId: t.messageId, channelId: t.channelId },
    });
  }

  return evidence;
}
