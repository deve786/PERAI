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
 * Supports column-wise table context (like ship schedules where each ship is a column).
 */
export function verifyItemGrounding(itemText: string, contextText: string): GroundingCheckResult {
  if (!contextText || !itemText) return { verified: true };

  const normContext = contextText.toLowerCase();
  const normItem = itemText.toLowerCase();

  // Detect and parse markdown tables from context
  const tables = extractAllTablesFromText(normContext);

  if (tables.length > 0) {
    // Table context detected - use column-aware verification
    for (const table of tables) {
      const result = verifyAgainstTable(itemText, table);
      if (result) return result;
    }
    // If table verification returned nothing, fall through to text-based check
  }

  // Fall back to text-based verification for non-table contexts
  return verifyAgainstText(itemText, contextText);
}

/**
 * Extracts markdown tables from text.
 */
function extractAllTablesFromText(text: string): ParsedTable[] {
  const lines = text.split('\n');
  const tables: ParsedTable[] = [];
  let i = 0;

  while (i < lines.length) {
    if (lines[i].includes('|')) {
      let tableStart = i;
      // Find the separator line
      let separatorIdx = -1;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].includes('|') && /^\s*\|?[\s\-:|]+\|?\s*$/.test(lines[j])) {
          separatorIdx = j;
          break;
        }
        if (!lines[j].includes('|') && lines[j].trim() !== '') {
          break;
        }
      }

      if (separatorIdx === -1) {
        i++;
        continue;
      }

      // Parse header
      const headers = parseMarkdownRow(lines[tableStart]);
      if (headers.length === 0) {
        i++;
        continue;
      }

      // Parse rows
      const rows: string[][] = [];
      for (let j = separatorIdx + 1; j < lines.length; j++) {
        if (!lines[j].includes('|')) break;
        if (/^\s*\|?[\s\-:|]+\|?\s*$/.test(lines[j])) continue;
        const row = parseMarkdownRow(lines[j]);
        if (row.length > 0) {
          while (row.length < headers.length) row.push('');
          if (row.length > headers.length) row.length = headers.length;
          rows.push(row);
        }
        i = j;
      }

      if (rows.length > 0) {
        const columnMap = new Map<string, number>();
        headers.forEach((h, idx) => {
          const normalized = h.trim().toLowerCase();
          if (normalized) columnMap.set(normalized, idx);
        });
        tables.push({ headers, rows, columnMap });
      }
      i = tableStart + 1;
    } else {
      i++;
    }
  }

  return tables;
}

interface ParsedTable {
  headers: string[];
  rows: string[][];
  columnMap: Map<string, number>;
}

function parseMarkdownRow(line: string): string[] {
  const trimmed = line.trim();
  const withoutOuter = trimmed.startsWith('|') && trimmed.endsWith('|')
    ? trimmed.slice(1, -1)
    : trimmed;
  return withoutOuter.split('|').map(c => c.trim());
}

/**
 * Verify an item against a parsed markdown table using column-wise logic.
 */
function verifyAgainstTable(itemText: string, table: ParsedTable): GroundingCheckResult | null {
  // Extract date from item
  const datePatterns = [
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g,
    /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*(?:\s*\d{2,4})?\b/g,
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*\d{2,4})?\b/g,
    /\b\d{4}-\d{2}-\d{2}\b/g,
  ];

  const dates: string[] = [];
  for (const pat of datePatterns) {
    const matches = itemText.match(pat);
    if (matches) dates.push(...matches.map(m => m.toLowerCase()));
  }

  // Find the ship name in the item
  const shipNames = ['mv l/seas', 'mv l/sea', 'mv lagoons', 'mv corals', 'mv a/sea', 'mv c/sea', 'mv d/sea'];
  let shipName = '';
  for (const s of shipNames) {
    if (itemText.toLowerCase().includes(s)) {
      shipName = s;
      break;
    }
  }

  // Find the date column index (usually column 0)
  let dateColIdx = 0;
  for (const [header, idx] of table.columnMap) {
    if (header.includes('date') || header.match(/\d{2}\/\d{2}/) || /^[0-9]{2}\/[0-9]{2}$/.test(header)) {
      dateColIdx = idx;
      break;
    }
  }

  if (dates.length === 0) {
    // No date in item - just check if the port code exists anywhere in the table
    // for the specified ship column
    if (shipName) {
      const shipColIdx = findColumnForShip(table, shipName);
      if (shipColIdx === null) return { verified: false, reason: `Ship ${shipName} not found in schedule` };

      // Extract port code from item
      const portCode = extractPortCode(itemText);
      if (portCode) {
        for (const row of table.rows) {
          const cell = row[shipColIdx] || '';
          if (new RegExp(`\\b${portCode}\\b`, 'i').test(cell)) {
            return { verified: true };
          }
        }
        return { verified: false, reason: `Port ${portCode} not found in ${shipName}'s column` };
      }
    }
    return null; // Can't verify - let caller decide
  }

  // For each date in the item, find the row and check the ship column
  for (const date of dates) {
    const rowIndex = findRowForDate(table, date, dateColIdx);
    if (rowIndex === -1) {
      return { verified: false, reason: `Date ${date} not found in schedule` };
    }

    // Get the cell content from the ship's column on this date
    if (shipName) {
      const shipColIdx = findColumnForShip(table, shipName);
      if (shipColIdx === null) {
        return { verified: false, reason: `Ship ${shipName} not found as a column` };
      }

      const cellContent = table.rows[rowIndex][shipColIdx] || '';

      // Extract port code from item and check if it exists in this cell
      const portCode = extractPortCode(itemText);
      if (portCode) {
        if (!new RegExp(`\\b${portCode}\\b`, 'i').test(cellContent)) {
          // Check if the port is in the NEXT row (for voyage tracing)
          // e.g., ship departs KOCHI on 23/10, arrives at island on 24/10
          if (rowIndex < table.rows.length - 1) {
            const nextRowContent = table.rows[rowIndex + 1][shipColIdx] || '';
            if (!new RegExp(`\\b${portCode}\\b`, 'i').test(nextRowContent)) {
              return { verified: false, reason: `Port ${portCode} not found in ${shipName}'s column on ${date}` };
            }
          } else {
            return { verified: false, reason: `Port ${portCode} not found in ${shipName}'s column on ${date}` };
          }
        }
      }
    }
  }

  return { verified: true };
}

/**
 * Find the column index for a ship by matching header text.
 */
function findColumnForShip(table: ParsedTable, shipName: string): number | null {
  const normalizedShip = shipName.toLowerCase();
  // Try direct match
  for (let i = 0; i < table.headers.length; i++) {
    const header = table.headers[i].toLowerCase();
    if (header.includes(normalizedShip) || normalizedShip.includes(header)) {
      return i;
    }
    // Handle common aliases
    if (normalizedShip === 'mv l/seas' || normalizedShip === 'mv l/sea') {
      if (header.includes('l/sea') || header.includes('lakshadweep')) return i;
    }
    if (normalizedShip === 'mv lagoons') {
      if (header.includes('lagoons')) return i;
    }
    if (normalizedShip === 'mv corals') {
      if (header.includes('corals')) return i;
    }
    if (normalizedShip === 'mv a/sea') {
      if (header.includes('a/sea')) return i;
    }
  }
  return null;
}

/**
 * Find the row index containing a specific date.
 */
function findRowForDate(table: ParsedTable, date: string, dateColIdx: number): number {
  // Normalize the date for matching
  const normalizedDate = date.toLowerCase();

  for (let i = 0; i < table.rows.length; i++) {
    const rowDate = table.rows[i][dateColIdx]?.toLowerCase() || '';
    // Try various date formats
    if (rowDate.includes(normalizedDate)) return i;

    // Try matching components
    const dateParts = normalizedDate.split(/\W+/).filter(Boolean);
    if (dateParts.length >= 2) {
      const [day, month] = dateParts;
      if (rowDate.includes(day) && rowDate.includes(month)) return i;
    }
  }

  return -1;
}

/**
 * Extract port/island code from text (e.g., BTR, AND, KLP, KVT, AGT, AMN, KDM, KLT, CHT, MCY).
 */
function extractPortCode(text: string): string | null {
  const portCodes = ['AND', 'KLP', 'KVT', 'AGT', 'AMN', 'KDM', 'KLT', 'CHT', 'BTR', 'MCY', 'KOCHI', 'Kochi'];
  const upperText = text.toUpperCase();

  for (const code of portCodes) {
    if (new RegExp(`\\b${code}\\b`, 'i').test(upperText)) {
      return code;
    }
  }

  // Also check for island names mentioned in aliases
  const lowerText = text.toLowerCase();
  const islandNames: Record<string, string> = {
    'bitra': 'BTR',
    'androth': 'AND',
    'kalpeni': 'KLP',
    'kavaratti': 'KVT',
    'agatti': 'AGT',
    'amini': 'AMN',
    'kadmat': 'KDM',
    'kiltan': 'KLT',
    'chetlat': 'CHT',
    'minicoy': 'MCY',
  };

  for (const [name, code] of Object.entries(islandNames)) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(lowerText)) {
      return code;
    }
  }

  return null;
}

/**
 * Text-based verification fallback.
 */
function verifyAgainstText(itemText: string, contextText: string): GroundingCheckResult {
  const normContext = contextText.toLowerCase();
  const normItem = itemText.toLowerCase();

  // Extract dates (e.g. 24/10/26, 24/10, 24 Oct, 2026-10-24)
  const datePatterns = [
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g,
    /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*(?:\s*\d{2,4})?\b/g,
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

