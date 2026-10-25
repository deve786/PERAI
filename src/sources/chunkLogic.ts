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
