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

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks whether an item returned by the AI is grounded in the retrieved context.
 * Detects hallucinations such as fabricated dates, non-existent port stops, or invented figures.
 * Supports column-wise table context (like ship schedules where each ship is a column).
 */
export function verifyItemGrounding(itemText: string, contextText: string): GroundingCheckResult {
  try {
    if (!contextText || !itemText) return { verified: true };

    const normContext = contextText.toLowerCase();

    // Detect and parse markdown tables from context
    const tables = extractAllTablesFromText(normContext);

    let tableFailureReason: string | undefined;

    if (tables.length > 0) {
      // Table context detected - use column-aware verification
      for (const table of tables) {
        const result = verifyAgainstTable(itemText, table);
        if (result) {
          if (result.verified) return { verified: true };
          tableFailureReason = result.reason;
        }
      }
    }

    // Fall back to text-based verification for non-table contexts or cross-page tables
    const textResult = verifyAgainstText(itemText, contextText);
    if (textResult.verified) {
      return { verified: true };
    }

    return {
      verified: false,
      reason: tableFailureReason || textResult.reason || 'Not verified in source context',
    };
  } catch (err) {
    console.warn('Grounding verification safely bypassed on error:', err);
    return { verified: true };
  }
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
      const tableStart = i;
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
      let lastRowIdx = separatorIdx;
      for (let j = separatorIdx + 1; j < lines.length; j++) {
        if (!lines[j].includes('|')) break;
        if (/^\s*\|?[\s\-:|]+\|?\s*$/.test(lines[j])) continue;
        const row = parseMarkdownRow(lines[j]);
        if (row.length > 0) {
          while (row.length < headers.length) row.push('');
          if (row.length > headers.length) row.length = headers.length;
          rows.push(row);
        }
        lastRowIdx = j;
      }

      if (rows.length > 0) {
        const columnMap = new Map<string, number>();
        headers.forEach((h, idx) => {
          const normalized = h.trim().toLowerCase();
          if (normalized) columnMap.set(normalized, idx);
        });
        tables.push({ headers, rows, columnMap });
      }
      i = lastRowIdx + 1;
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
  const shipNames = [
    'mv l/seas', 'mv l/sea', 'm v / l sea', 'mv lakshadweep sea', 'lakshadweep sea',
    'mv lagoons', 'mv corals', 'mv a/sea', 'mv arabian sea', 'mv c/sea', 'mv d/sea'
  ];
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
    if (shipName) {
      const shipColIdx = findColumnForShip(table, shipName);
      if (shipColIdx === null) return null;

      const portCodes = extractAllPortCodes(itemText);
      if (portCodes.length > 0) {
        for (const p of portCodes) {
          let foundP = false;
          for (const row of table.rows) {
            const cell = row[shipColIdx] || '';
            if (new RegExp(`\\b${p}\\b`, 'i').test(cell)) {
              foundP = true;
              break;
            }
          }
          if (!foundP) return { verified: false, reason: `Port ${p} not found in ${shipName}'s column` };
        }
        return { verified: true };
      }
    }
    return null;
  }

  // For each date in the item, check if this table contains that date
  for (const date of dates) {
    const rowIndex = findRowForDate(table, date, dateColIdx);
    if (rowIndex === -1) {
      // Date not in this table - don't fail, another table may have it
      return null;
    }

    if (shipName) {
      const shipColIdx = findColumnForShip(table, shipName);
      if (shipColIdx === null) {
        return null;
      }

      const cellContent = table.rows[rowIndex][shipColIdx] || '';

      // Check for lay up
      if (/\blay\s*up\b/i.test(itemText)) {
        if (/lay\s*up/i.test(cellContent) || /\blay\b/i.test(cellContent)) {
          return { verified: true };
        }
        return { verified: false, reason: `Ship not in lay up on ${date}` };
      }

      // Check for Kochi departures / arrivals
      if (/\bkochi\b|\bcochin\b|\bcok\b/i.test(itemText)) {
        if (/kochi|cochin|cok|lsg/i.test(cellContent)) {
          return { verified: true };
        }
      }

      // Extract all port codes from item and verify every single one exists in cell (or next row if departure)
      const portCodes = extractAllPortCodes(itemText);
      if (portCodes.length > 0) {
        const isDept = /dept/i.test(cellContent) || /kochi/i.test(cellContent);
        const nextRowContent = (isDept && rowIndex < table.rows.length - 1)
          ? (table.rows[rowIndex + 1][shipColIdx] || '')
          : '';
        const combined = `${cellContent} ${nextRowContent}`;

        for (const p of portCodes) {
          if (!new RegExp(`\\b${p}\\b`, 'i').test(combined)) {
            return { verified: false, reason: `Port ${p} not found in ${shipName}'s column on ${date}` };
          }
        }
        return { verified: true };
      }
    }
  }

  return { verified: true };
}

/**
 * Find the column index for a ship by matching header text with robust normalization.
 */
function findColumnForShip(table: ParsedTable, shipName: string): number | null {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const targetClean = clean(shipName);

  for (let i = 0; i < table.headers.length; i++) {
    const headerClean = clean(table.headers[i]);
    if (!headerClean) continue;

    if (headerClean.includes(targetClean) || targetClean.includes(headerClean)) {
      return i;
    }

    // MV Lakshadweep Sea aliases (e.g. "M V / L SEA", "MV L/SEA", "LAKSHADWEEP")
    if (targetClean.includes('lsea') || targetClean.includes('lakshadweep')) {
      if (headerClean.includes('lsea') || headerClean.includes('lakshadweep')) return i;
    }

    // MV Lagoons aliases
    if (targetClean.includes('lagoon')) {
      if (headerClean.includes('lagoon')) return i;
    }

    // MV Corals aliases
    if (targetClean.includes('coral')) {
      if (headerClean.includes('coral')) return i;
    }

    // MV Arabian Sea aliases
    if (targetClean.includes('asea') || targetClean.includes('arabian')) {
      if (headerClean.includes('asea') || headerClean.includes('arabian')) return i;
    }
  }

  return null;
}

/**
 * Find the row index containing a specific date.
 */
function findRowForDate(table: ParsedTable, date: string, dateColIdx: number): number {
  const normalizedDate = date.toLowerCase();

  for (let i = 0; i < table.rows.length; i++) {
    const rowDate = table.rows[i][dateColIdx]?.toLowerCase() || '';
    if (rowDate.includes(normalizedDate)) return i;

    const dateParts = normalizedDate.split(/\W+/).filter(Boolean);
    if (dateParts.length >= 2) {
      const [day, month] = dateParts;
      if (rowDate.includes(day) && rowDate.includes(month)) return i;
    }
  }

  // Also check if any other column has the date (in case date is not col 0)
  for (let i = 0; i < table.rows.length; i++) {
    for (let c = 0; c < table.rows[i].length; c++) {
      if (c === dateColIdx) continue;
      const cell = table.rows[i][c]?.toLowerCase() || '';
      if (cell.includes(normalizedDate)) return i;
    }
  }

  return -1;
}

/**
 * Extract all port/island codes from text (e.g., BTR, AND, KLP, KVT, AGT, AMN, KDM, KLT, CHT, MCY, KOCHI, COK).
 */
function extractAllPortCodes(text: string): string[] {
  const portCodes = ['AND', 'KLP', 'KVT', 'AGT', 'AMN', 'KDM', 'KLT', 'CHT', 'BTR', 'MCY', 'KOCHI', 'COCHIN', 'COK', 'LSG'];
  const upperText = text.toUpperCase();
  const found: string[] = [];

  for (const code of portCodes) {
    if (new RegExp(`\\b${code}\\b`, 'i').test(upperText)) {
      found.push(code === 'COCHIN' || code === 'COK' || code === 'LSG' ? 'KOCHI' : code);
    }
  }

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
    'cochin': 'KOCHI',
    'kochi': 'KOCHI',
  };

  for (const [name, code] of Object.entries(islandNames)) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(lowerText)) {
      found.push(code);
    }
  }

  return Array.from(new Set(found));
}

function extractPortCode(text: string): string | null {
  const all = extractAllPortCodes(text);
  return all.length > 0 ? all[0] : null;
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

      // Extract specific island/route/subject codes from the item, stripping brackets/parentheses to prevent RegExp errors
      const dateParts = d.split(/\D+/).filter(Boolean);
      const itemTokens = normItem
        .replace(/[()[\]{}]/g, ' ')
        .split(/[\s·,|/–—]+/)
        .map(t => t.trim())
        .filter(t => t.length >= 2 && !['mv', 'the', 'and', 'for', 'with', 'arr', 'dept', 'at', 'in', 'sea', 'corals', 'lagoons', 'arabian', 'lakshadweep', 'voyage', 'voyages'].includes(t))
        .filter(t => !dates.includes(t) && !dateParts.includes(t));

      if (itemTokens.length > 0) {
        // Words must match as distinct whole tokens or port codes (e.g. \bbtr\b)
        const matchingTokens = itemTokens.filter(tok => {
          try {
            const escaped = escapeRegex(tok);
            const reg = new RegExp(`\\b${escaped}\\b`, 'i');
            return reg.test(rowSnippet);
          } catch {
            return rowSnippet.includes(tok.toLowerCase());
          }
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

