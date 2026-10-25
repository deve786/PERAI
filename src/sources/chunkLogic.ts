/**
 * Pure logic for document chunking, stitching, and grouping.
 * Free of React Native / Expo imports so it runs cleanly anywhere (tests, CLI, app).
 */
import type { DocumentChunk } from './types';

export interface GroupedDocument {
  refId: string;
  documentId: string;
  filename: string;
  content: string;
  pages: number[];
  chunkCount: number;
  createdAt?: string;
}

/**
 * Seamlessly stitches overlapping or adjacent chunks back into coherent text.
 */
export function stitchChunkContents(chunks: DocumentChunk[]): string {
  if (chunks.length === 0) return '';
  if (chunks.length === 1) return chunks[0].content;

  const sorted = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  let full = sorted[0].content;

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i].content;
    const tail = full.slice(-600);
    let overlapLen = 0;
    for (let len = Math.min(tail.length, next.length, 500); len >= 20; len--) {
      const needle = tail.slice(-len);
      if (next.startsWith(needle)) {
        overlapLen = len;
        break;
      }
    }
    if (overlapLen > 0) {
      full += next.slice(overlapLen);
    } else {
      full += '\n\n' + next;
    }
  }
  return full;
}

/**
 * Groups chunks by documentId, stitches sequential chunks into unified text,
 * and assigns sequential reference IDs (D0, D1...).
 */
export function groupAndStitchDocumentChunks(chunks: DocumentChunk[]): GroupedDocument[] {
  const groups = new Map<string, {
    documentId: string;
    filename: string;
    pages: Set<number>;
    chunks: DocumentChunk[];
    createdAt?: string;
  }>();

  for (const c of chunks) {
    if (!groups.has(c.documentId)) {
      groups.set(c.documentId, {
        documentId: c.documentId,
        filename: c.filename || 'Document',
        pages: new Set(),
        chunks: [],
        createdAt: c.createdAt,
      });
    }
    const g = groups.get(c.documentId)!;
    g.chunks.push(c);
    if (c.pageNumber) g.pages.add(c.pageNumber);
  }

  const result: GroupedDocument[] = [];
  let idx = 0;
  for (const [, g] of groups) {
    const content = stitchChunkContents(g.chunks);
    result.push({
      refId: `D${idx++}`,
      documentId: g.documentId,
      filename: g.filename,
      content,
      pages: Array.from(g.pages).sort((a, b) => a - b),
      chunkCount: g.chunks.length,
      createdAt: g.createdAt,
    });
  }
  return result;
}

export interface GroundingCheckResult {
  verified: boolean;
  reason?: string;
}

/**
 * Checks whether an item returned by the AI is grounded in the retrieved context.
 * Detects hallucinations such as fabricated dates, non-existent port stops, or invented figures.
 */
export function verifyItemGrounding(itemText: string, contextText: string): GroundingCheckResult {
  if (!contextText || !itemText) return { verified: true };

  const normContext = contextText.toLowerCase();
  const normItem = itemText.toLowerCase();

  // Extract dates (e.g. 24/10/26, 24/10, 24 Oct, 2026-10-24)
  const datePatterns = [
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g,
    /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*(?:\s+\d{2,4})?\b/g,
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*\d{2,4})?\b/g,
    /\b\d{4}-\d{2}-\d{2}\b/g,
  ];

  const dates: string[] = [];
  for (const pat of datePatterns) {
    const matches = normItem.match(pat);
    if (matches) dates.push(...matches);
  }

  if (dates.length > 0) {
    for (const d of dates) {
      const dIndex = normContext.indexOf(d);
      if (dIndex === -1) {
        return { verified: false, reason: `Date ${d} not found in source` };
      }

      // Find the specific line or bounded snippet containing this date
      const lineStart = normContext.lastIndexOf('\n', dIndex);
      const nextLine = normContext.indexOf('\n', dIndex);
      const rowSnippet = normContext.slice(
        lineStart === -1 ? 0 : lineStart,
        nextLine === -1 ? normContext.length : nextLine
      );

      // Extract specific island/route/subject codes from the item
      const dateParts = d.split(/\D+/).filter(Boolean);
      const itemTokens = normItem
        .split(/[\s·,|/–—]+/)
        .map(t => t.trim())
        .filter(t => t.length >= 2 && !['mv', 'the', 'and', 'for', 'with', 'arr', 'dept', 'at', 'in', 'sea', 'corals', 'lagoons', 'arabian', 'lakshadweep'].includes(t))
        .filter(t => !dates.includes(t) && !dateParts.includes(t));

      if (itemTokens.length > 0) {
        // Words must match as distinct whole tokens or port codes (e.g. \bbtr\b)
        const matchingTokens = itemTokens.filter(tok => {
          const reg = new RegExp(`\\b${tok}\\b`, 'i');
          return reg.test(rowSnippet);
        });
        if (matchingTokens.length === 0) {
          return { verified: false, reason: `Details not found on date ${d}` };
        }
      }
    }
    return { verified: true };
  }

  // If no date, verify general key token presence in context
  const allWords = normItem
    .split(/[\s·,|-]+/)
    .map(w => w.trim())
    .filter(w => w.length >= 3 && !['the', 'and', 'for', 'with'].includes(w));

  if (allWords.length > 0) {
    const matched = allWords.filter(w => normContext.includes(w)).length;
    if (matched / allWords.length < 0.4) {
      return { verified: false, reason: 'Key terms not found in source' };
    }
  }

  return { verified: true };
}

