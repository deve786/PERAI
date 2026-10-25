/**
 * Markdown table parser for structured data extraction.
 * Parses tables into column-oriented format for voyage/schedule queries.
 */
export interface ParsedTable {
  headers: string[];
  rows: string[][];
  columnMap: Map<string, number>; // header -> column index
}

export interface TableColumn {
  header: string;
  columnIndex: number;
  cells: string[]; // one per row
}

/**
 * Parses a GitHub-flavored markdown table into structured data.
 * Returns column-oriented data for easier voyage tracing.
 */
export function parseMarkdownTable(markdown: string): ParsedTable | null {
  const lines = markdown.trim().split('\n');
  if (lines.length < 3) return null;

  // Find the header line (first line with |)
  let headerLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('|')) {
      headerLineIndex = i;
      break;
    }
  }
  if (headerLineIndex === -1) return null;

  // Find the separator line (---|---)
  let separatorLineIndex = -1;
  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    if (lines[i].includes('|') && /^\s*\|?[\s\-:|]+\|?\s*$/.test(lines[i])) {
      separatorLineIndex = i;
      break;
    }
  }
  if (separatorLineIndex === -1) return null;

  // Parse headers
  const headerLine = lines[headerLineIndex];
  const headers = parseTableRow(headerLine);
  if (headers.length === 0) return null;

  // Parse data rows
  const rows: string[][] = [];
  for (let i = separatorLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('|')) continue;
    if (/^\s*\|?[\s\-:|]+\|?\s*$/.test(line)) continue; // skip extra separators
    const row = parseTableRow(line);
    if (row.length > 0) {
      // Pad or trim to match header count
      while (row.length < headers.length) row.push('');
      if (row.length > headers.length) row.length = headers.length;
      rows.push(row);
    }
  }

  // Build column map
  const columnMap = new Map<string, number>();
  headers.forEach((h, idx) => {
    const normalized = h.trim().toLowerCase();
    if (normalized) columnMap.set(normalized, idx);
  });

  return { headers, rows, columnMap };
}

function parseTableRow(line: string): string[] {
  // Remove leading/trailing pipes and split by |
  const trimmed = line.trim();
  const withoutOuter = trimmed.startsWith('|') && trimmed.endsWith('|')
    ? trimmed.slice(1, -1)
    : trimmed;
  const cells = withoutOuter.split('|').map(c => c.trim());
  return cells;
}

/**
 * Extracts all columns from a parsed table as structured column data.
 */
export function extractTableColumns(table: ParsedTable): TableColumn[] {
  const columns: TableColumn[] = [];
  for (let colIdx = 0; colIdx < table.headers.length; colIdx++) {
    const header = table.headers[colIdx];
    const cells = table.rows.map(row => row[colIdx] || '');
    columns.push({
      header,
      columnIndex: colIdx,
      cells,
    });
  }
  return columns;
}

/**
 * Finds the column index for a ship/vessel by matching header text.
 */
export function findShipColumn(table: ParsedTable, shipName: string): number | null {
  const normalizedShip = shipName.toLowerCase();
  for (const [header, idx] of table.columnMap) {
    if (header.includes(normalizedShip) || normalizedShip.includes(header)) {
      return idx;
    }
    // Handle common aliases
    if (normalizedShip === 'mv l/sea' || normalizedShip === 'mv lakshadweep sea') {
      if (header.includes('l/sea') || header.includes('lakshadweep')) return idx;
    }
    if (normalizedShip === 'mv a/sea') {
      if (header.includes('a/sea')) return idx;
    }
    if (normalizedShip === 'mv lagoons') {
      if (header.includes('lagoons')) return idx;
    }
    if (normalizedShip === 'mv corals') {
      if (header.includes('corals')) return idx;
    }
  }
  return null;
}

/**
 * Extracts a complete voyage for a ship from the table.
 * Returns array of { date, cellContent } for each row in that ship's column.
 */
export function extractShipVoyage(table: ParsedTable, shipColumnIndex: number, dateColumnIndex = 0): Array<{ date: string; content: string; rowIndex: number }> {
  const voyage: Array<{ date: string; content: string; rowIndex: number }> = [];
  for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
    const row = table.rows[rowIdx];
    const date = row[dateColumnIndex] || '';
    const content = row[shipColumnIndex] || '';
    if (date || content) {
      voyage.push({ date, content, rowIndex: rowIdx });
    }
  }
  return voyage;
}

/**
 * Searches for a port/island code within a specific ship's voyage column.
 * Returns all matching voyage entries.
 */
export function findPortInShipVoyage(
  table: ParsedTable,
  shipColumnIndex: number,
  portCode: string,
  dateColumnIndex = 0
): Array<{ date: string; content: string; rowIndex: number }> {
  const results: Array<{ date: string; content: string; rowIndex: number }> = [];
  const normalizedPort = portCode.toUpperCase();

  for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
    const row = table.rows[rowIdx];
    const date = row[dateColumnIndex] || '';
    const content = row[shipColumnIndex] || '';

    // Check if port code appears in this cell (as whole word)
    const portPattern = new RegExp(`\\b${normalizedPort}\\b`, 'i');
    if (portPattern.test(content)) {
      results.push({ date, content, rowIndex: rowIdx });
    }
  }
  return results;
}

/**
 * Gets the next voyage from a departure point (e.g., KOCHI) to a destination.
 * Traces down the ship's column from the departure row.
 */
export function findNextVoyageFromPort(
  table: ParsedTable,
  shipColumnIndex: number,
  fromPort: string,
  toPort: string,
  dateColumnIndex = 0
): Array<{ date: string; fromContent: string; toContent: string; rowIndex: number }> {
  const results: Array<{ date: string; fromContent: string; toContent: string; rowIndex: number }> = [];
  const fromPattern = new RegExp(`\\b${fromPort}\\b`, 'i');
  const toPattern = new RegExp(`\\b${toPort}\\b`, 'i');

  for (let rowIdx = 0; rowIdx < table.rows.length - 1; rowIdx++) {
    const currentRow = table.rows[rowIdx];
    const nextRow = table.rows[rowIdx + 1];

    const currentContent = currentRow[shipColumnIndex] || '';
    const nextContent = nextRow[shipColumnIndex] || '';
    const currentDate = currentRow[dateColumnIndex] || '';
    const nextDate = nextRow[dateColumnIndex] || '';

    // Check if current row has departure from port
    if (fromPattern.test(currentContent)) {
      // Check if next row in same column has destination port
      if (toPattern.test(nextContent)) {
        results.push({
          date: nextDate,
          fromContent: currentContent,
          toContent: nextContent,
          rowIndex: rowIdx + 1,
        });
      }
    }
  }
  return results;
}

/**
 * Checks if text contains a markdown table.
 */
export function containsMarkdownTable(text: string): boolean {
  const lines = text.split('\n');
  let pipeCount = 0;
  for (const line of lines) {
    if (line.includes('|')) pipeCount++;
    if (pipeCount >= 2) return true;
  }
  return false;
}

/**
 * Extracts all markdown tables from text.
 */
export function extractAllTables(text: string): ParsedTable[] {
  const tables: ParsedTable[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    if (lines[i].includes('|')) {
      // Try to parse table starting here
      const tableText = lines.slice(i).join('\n');
      const parsed = parseMarkdownTable(tableText);
      if (parsed) {
        tables.push(parsed);
        // Skip past this table
        let rowCount = 0;
        for (let j = i; j < lines.length; j++) {
          if (lines[j].includes('|')) rowCount++;
          else if (rowCount > 0) break;
        }
        i += rowCount;
        continue;
      }
    }
    i++;
  }
  return tables;
}

/**
 * Extracts and formats per-vessel chronological timelines and complete voyages from tables.
 * Transforms column-oriented ship schedules into easily readable linear timelines for each vessel,
 * preventing LLM column/row confusion and enabling full voyage tracing.
 */
export function generatePerVesselTimelines(text: string): string {
  const tables = extractAllTables(text);
  if (tables.length === 0) return '';

  const vesselColumns: Array<{
    name: string;
    entries: Array<{ date: string; day: string; content: string }>;
  }> = [];

  for (const table of tables) {
    let dateIdx = -1;
    let dayIdx = -1;
    const ships: Array<{ name: string; idx: number }> = [];

    table.headers.forEach((h, idx) => {
      const lower = h.toLowerCase();
      if (lower.includes('date') || lower.match(/\d\d\/\d\d/)) dateIdx = idx;
      else if (lower.includes('day')) dayIdx = idx;
      else if (
        lower.includes('mv') ||
        lower.includes('sea') ||
        lower.includes('corals') ||
        lower.includes('lagoons') ||
        lower.includes('vessel') ||
        lower.includes('a/sea') ||
        lower.includes('l/sea')
      ) {
        ships.push({ name: h.trim(), idx });
      }
    });

    if (dateIdx === -1) dateIdx = 0;
    if (ships.length === 0) continue;

    for (const ship of ships) {
      let existing = vesselColumns.find((v) => {
        const a = v.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const b = ship.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return a.includes(b) || b.includes(a);
      });

      if (!existing) {
        existing = { name: ship.name, entries: [] };
        vesselColumns.push(existing);
      }

      for (const row of table.rows) {
        const date = (row[dateIdx] || '').trim();
        const day = dayIdx >= 0 ? (row[dayIdx] || '').trim() : '';
        const content = (row[ship.idx] || '').trim();
        if (date && content) {
          if (!existing.entries.some((e) => e.date === date)) {
            existing.entries.push({ date, day, content });
          }
        }
      }
    }
  }

  if (vesselColumns.length === 0) return '';

  let output = '\n=== EXTRACTED VOYAGE TIMELINES PER VESSEL (COLUMN-WISE SCHEDULE) ===\n';
  output += 'Notice: Each ship below represents ONE column across dates. A complete voyage starts with departure from Kochi, visits all listed islands in sequence, and ends when the vessel arrives back in Kochi.\n';

  for (const v of vesselColumns) {
    output += `\n🚢 VESSEL: ${v.name}\n`;
    let voyageNum = 1;
    let inVoyage = false;

    for (let i = 0; i < v.entries.length; i++) {
      const e = v.entries[i];
      const isDept = /dept/i.test(e.content) || (/kochi/i.test(e.content) && !/arr/i.test(e.content));
      const isArr = /arr/i.test(e.content) && /kochi/i.test(e.content);

      if (isDept && !inVoyage) {
        output += `  [Voyage ${voyageNum++}]\n`;
        inVoyage = true;
      }

      const dayStr = e.day ? ` (${e.day})` : '';
      output += `  • ${e.date}${dayStr}: ${e.content}\n`;

      if (isArr && inVoyage) {
        inVoyage = false;
      }
    }
  }

  return output;
}