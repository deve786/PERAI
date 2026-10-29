/**
 * Enhanced retrieval across all data sources.
 */
import type { Memory } from '@/types';
import type { ExpenseRow } from '@/expense/db';
import type { DocumentChunk, TelegramMessage, WebsiteData } from './types';
import { searchDocumentChunks } from './documents';
import { searchWebsiteContent } from './websites';
import { searchTelegramMessages } from './telegram';
import { MAX_CONTEXT_MEMORIES, selectRelevantMemories } from '@/ai/retrieval';
import { renderMemory } from '@/ai/ask';
import { extractRelevantWebsiteSnippets } from './websiteLogic';
import { generatePerVesselTimelines } from './tableParser';

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
  /** The period the question named, if any — stated in the prompt so the model knows the scope. */
  range?: { label: string } | null;
  /** How many memories the question could have matched before the slice was taken. */
  memoryPool?: number;
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
    // A month of ordinary capture runs well past 40 entries, and a total added
    // up from the first 40 of them is wrong without ever looking wrong. The
    // slice matches what the single-source path has always used.
    maxMemories = MAX_CONTEXT_MEMORIES,
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
    range: memoryResult.range,
    memoryPool: memoryResult.poolSize,
  };
}

/**
 * Build unified context string for AI prompt.
 */
export function buildUnifiedContext(
  result: RetrievalResult,
  expenseContext?: unknown,
  question?: string
): string {
  let context = '';

  // Memories section.
  //
  // Rendered by renderMemory, the same way the single-source path has always
  // rendered them. The short form this used to build left out the one field
  // that decides half the questions asked of it — whether the entry is still
  // to do or already done — so "which games are still left to play" listed
  // the finished ones too. Type, category and tags went the same way.
  if (result.memories.length > 0) {
    const scope = result.range
      ? `recorded during ${result.range.label}`
      : 'the most relevant of what is recorded';
    const truncated =
      typeof result.memoryPool === 'number' && result.memoryPool > result.memories.length
        ? ` — only ${result.memories.length} of ${result.memoryPool} are shown, so do NOT present a total or a count over them as complete; say it covers the ${result.memories.length} shown`
        : '';
    context += `\n\n=== YOUR PERSONAL MEMORIES (${scope}${truncated}) ===\n`;
    result.memories.forEach((m, i) => {
      context += `${renderMemory(m, `M${i}`)}\n\n`;
    });
  }

  // Expense context from Money data
  if (expenseContext) {
    context += '\n\n=== YOUR EXPENSE DATA ===\n';
    context +=
      [
        'HOW TO READ THIS: every total below is already worked out, and already has refunds and paybacks taken off.',
        'Use the worked-out total whenever one covers what was asked, and do NOT add the figures up yourself:',
        '- a place, or a category within a place ("tickets in Minicoy") -> byPlace[].total and byPlace[].byCategory',
        '- a month, or a category within a month -> monthlySummaries[].total and .byCategory',
        '- the last 7 or 30 days -> last7Days / last30Days; everything ever -> allTime',
        'byPlace covers every expense ever recorded, not only the recent ones listed individually.',
        'On an individual expense, "spent" is what it really cost after any refund or payback — total "spent", never "billedAmount", which is only what was billed before the money came back.',
        'If no worked-out total covers the question, add up "spent" and say how many entries the figure covers.',
        '',
      ].join('\n');
    context += typeof expenseContext === 'string' ? expenseContext : JSON.stringify(expenseContext);
  }

  // Document chunks section
  const groupedDocs = groupAndStitchDocumentChunks(result.documentChunks);
  if (groupedDocs.length > 0) {
    context += '\n\n=== DOCUMENTS ===\n';
    groupedDocs.forEach((d) => {
      const page = d.pages.length > 0 ? ` (Pages ${d.pages.join(', ')})` : '';
      context += `[${d.refId}] From "${d.filename}"${page}:\n`;
      context += `${d.content}\n\n`;

      // Extract and append structured per-vessel timelines if document has ship schedule tables
      const timelines = generatePerVesselTimelines(d.content);
      if (timelines) {
        context += `${timelines}\n\n`;
      }
    });
  }

  // Website data section
  if (result.websites.length > 0) {
    context += '\n\n=== WEBSITE DATA ===\n';
    result.websites.forEach((w, i) => {
      context += `[W${i}] From ${w.url}${w.title ? ` - ${w.title}` : ''}:\n`;
      const snippet = extractRelevantWebsiteSnippets(w.content, question || '', 8000);
      context += `${snippet}\n\n`;
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

export {
  type GroupedDocument,
  stitchChunkContents,
  groupAndStitchDocumentChunks,
} from './chunkLogic';
import { groupAndStitchDocumentChunks } from './chunkLogic';

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

  // Add document evidence from grouped and stitched documents
  const groupedDocs = groupAndStitchDocumentChunks(result.documentChunks);
  groupedDocs.forEach((d) => {
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

    const pageInfo = d.pages.length > 0
      ? `Pages ${d.pages.join(', ')}`
      : d.chunkCount > 1
        ? `${d.chunkCount} Sections`
        : 'Document';
    const dateInfo = d.createdAt ? formatToIST(d.createdAt) : '';

    evidence.push({
      refId: d.refId,
      type: 'document',
      id: d.documentId,
      title: filename,
      subtitle: dateInfo ? `${pageInfo} · ${dateInfo}` : pageInfo,
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
