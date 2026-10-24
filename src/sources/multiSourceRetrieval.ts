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
    maxMemories = 40,
    maxDocuments = 12,
    maxWebsites = 6,
    maxTelegram = 20,
  } = options;

  // Retrieve from all sources in parallel
  const memoryResult = selectRelevantMemories(question, allMemories, new Date(nowISO), maxMemories);
  const [documentChunks, websites, telegramMessages] = await Promise.all([
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
export function buildUnifiedContext(result: RetrievalResult, expenseContext?: unknown): string {
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
    context += typeof expenseContext === 'string' ? expenseContext : JSON.stringify(expenseContext, null, 2);
  }

  // Document chunks section
  if (result.documentChunks.length > 0) {
    context += '\n\n=== DOCUMENTS ===\n';
    result.documentChunks.forEach((d, i) => {
      const page = d.pageNumber ? ` (page ${d.pageNumber})` : '';
      context += `[D${i}] From "${d.filename}"${page}:\n`;
      context += `${d.content}\n\n`;
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

export type SourceBadgeKind = 'image' | 'pdf' | 'docx' | 'video' | 'document' | 'text' | 'website' | 'memory' | 'expense';

/**
 * Formats an ISO string or date into Indian Standard Time (IST).
 * Example: "2026-10-24T12:40:47+00:00" -> "24 Oct 2026, 6:10 PM IST"
 */
export function formatToIST(isoOrDateStr?: string | null): string {
  if (!isoOrDateStr) return '';
  try {
    const date = new Date(isoOrDateStr);
    if (isNaN(date.getTime())) return isoOrDateStr;

    if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDateStr.trim())) {
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(date);
    }

    const formatted = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);

    return `${formatted} IST`;
  } catch {
    return isoOrDateStr;
  }
}

/**
 * Format evidence for display in Ask tab with badges and IST timestamps.
 */
export interface EvidenceItem {
  refId: string;
  type: 'memory' | 'document' | 'website' | 'telegram';
  id: string;
  title: string;
  subtitle: string;
  sourceKind?: SourceBadgeKind;
  badgeLabel?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

export function formatEvidence(result: RetrievalResult): EvidenceItem[] {
  const evidence: EvidenceItem[] = [];

  // Add memory evidence
  result.memories.forEach((m, i) => {
    evidence.push({
      refId: `M${i}`,
      type: 'memory',
      id: m.id,
      title: m.title,
      subtitle: formatToIST(m.eventDate),
      sourceKind: 'memory',
      badgeLabel: '🧠 Memory',
      content: m.rawInput,
      metadata: { category: m.category, type: m.type },
    });
  });

  // Add document evidence
  result.documentChunks.forEach((d, i) => {
    const filename = d.filename || 'Document';
    const lower = filename.toLowerCase();
    let sourceKind: SourceBadgeKind = 'document';
    let badgeLabel = '📁 Document';

    if (lower.endsWith('.pdf')) {
      sourceKind = 'pdf';
      badgeLabel = '📄 PDF';
    } else if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
      sourceKind = 'docx';
      badgeLabel = '📝 Word Doc';
    } else if (/\.(png|jpg|jpeg|webp|gif)$/i.test(lower)) {
      sourceKind = 'image';
      badgeLabel = '📷 Image';
    } else if (lower.endsWith('.txt')) {
      sourceKind = 'text';
      badgeLabel = '📄 Text Doc';
    }

    const chunkInfo = d.pageNumber ? `Page ${d.pageNumber}` : `Section ${d.chunkIndex + 1}`;
    const dateInfo = d.createdAt ? formatToIST(d.createdAt) : '';

    evidence.push({
      refId: `D${i}`,
      type: 'document',
      id: d.id,
      title: filename,
      subtitle: dateInfo ? `${chunkInfo} · ${dateInfo}` : chunkInfo,
      sourceKind,
      badgeLabel,
      content: d.content.substring(0, 200),
      metadata: { documentId: d.documentId },
    });
  });

  // Add website evidence
  result.websites.forEach((w, i) => {
    const timeStr = formatToIST(w.lastUpdated || w.scrapedAt);
    let hostname = '';
    try {
      hostname = new URL(w.url).hostname;
    } catch {
      hostname = w.url;
    }

    evidence.push({
      refId: `W${i}`,
      type: 'website',
      id: w.id,
      title: w.title || hostname,
      subtitle: timeStr ? `${hostname} · ${timeStr}` : hostname,
      sourceKind: 'website',
      badgeLabel: '🌐 Website',
      content: w.content.substring(0, 200),
      metadata: { url: w.url },
    });
  });

  // Add telegram evidence
  result.telegramMessages.forEach((t, i) => {
    let sourceKind: SourceBadgeKind = 'text';
    let badgeLabel = '💬 Telegram';

    const text = t.messageText || '';
    if (
      t.mediaType === 'photo' ||
      text.includes('[Photo') ||
      text.includes('[Extracted Poster') ||
      text.includes('[Image OCR Content]')
    ) {
      sourceKind = 'image';
      badgeLabel = '📷 Image Notice';
    } else if (t.mediaType === 'video' || text.includes('[Video')) {
      sourceKind = 'video';
      badgeLabel = '🎥 Video';
    } else if (t.mediaType === 'document' || text.includes('[Document')) {
      sourceKind = 'document';
      badgeLabel = '📎 Document';
    }

    evidence.push({
      refId: `T${i}`,
      type: 'telegram',
      id: t.id,
      title: t.channelName || 'Telegram',
      subtitle: formatToIST(t.messageDate),
      sourceKind,
      badgeLabel,
      content: text || '[Media message]',
      metadata: { channelId: t.channelId },
    });
  });

  return evidence;
}
