/**
 * Document upload, processing, and retrieval.
 */
import * as DocumentPicker from 'expo-document-picker';
import { File, Directory, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { getSourcesDb, uuid } from './client';
import { extractText } from './extractors';
import { containsMarkdownTable, extractAllTables, findShipColumn, extractShipVoyage, findPortInShipVoyage, findNextVoyageFromPort, type ParsedTable, type TableColumn } from './tableParser';

export interface Document {
  id: string;
  filename: string;
  fileType: 'pdf' | 'docx' | 'txt' | 'image' | 'other';
  fileSize: number;
  fileUri: string;
  uploadedAt: string;
  processed: boolean;
  chunkCount: number;
  updatedAt: string;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  pageNumber: number | null;
  createdAt: string;
  filename?: string;
  tableHeaders?: string[];
  columnIndex?: number;
  isTableData?: boolean;
}

// File size limits (in bytes)
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB for images (OCR is expensive)
const MIN_TEXT_LENGTH = 3; // Minimum characters after extraction

function getDocumentsDirectory(): Directory {
  try {
    if (Paths && Paths.document) {
      return new Directory(Paths.document, 'perai_documents');
    }
  } catch {}
  const baseUri = FileSystem.documentDirectory || 'file:///data/user/0/com.perai.app/files/';
  return new Directory(baseUri, 'perai_documents');
}

async function ensureDocumentsDir() {
  try {
    const dir = getDocumentsDirectory();
    if (!dir.exists) {
      dir.create({ intermediates: true });
    }
  } catch {
    const baseUri = FileSystem.documentDirectory || 'file:///data/user/0/com.perai.app/files/';
    await FileSystem.makeDirectoryAsync(`${baseUri}perai_documents/`, { intermediates: true }).catch(() => {});
  }
}

function getFileType(mimeType?: string, filename?: string): Document['fileType'] {
  const mime = (mimeType || '').toLowerCase();
  const name = (filename || '').toLowerCase();

  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (mime.includes('wordprocessingml') || mime.includes('msword') || name.endsWith('.docx') || name.endsWith('.doc')) return 'docx';
  if (mime.includes('text/plain') || name.endsWith('.txt') || name.endsWith('.csv') || name.endsWith('.md')) return 'txt';
  if (mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|heic)$/i.test(name)) return 'image';
  return 'other';
}

/**
 * Chunk text into cohesive pieces for retrieval.
 * Uses 12,000 characters so multi-page tables, voyage schedules, and letters
 * stay together without severing markdown rows or losing headers.
 */
function chunkText(text: string, chunkSize = 12000, overlap = 500): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= chunkSize) {
    return trimmed.length > 0 ? [trimmed] : [];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < trimmed.length) {
    const end = Math.min(start + chunkSize, trimmed.length);
    chunks.push(trimmed.slice(start, end).trim());
    start += chunkSize - overlap;
  }

  return chunks.filter(c => c.length > 0);
}

/**
 * Parse text into table-aware chunks.
 * For markdown tables, stores the full table as a single chunk with metadata.
 * For non-table text, uses standard chunking.
 */
interface ChunkWithMetadata {
  content: string;
  tableHeaders?: string[];
  isTableData?: boolean;
}

function chunkTextWithTables(text: string, chunkSize = 12000, overlap = 500): ChunkWithMetadata[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Check if text contains markdown tables
  if (!containsMarkdownTable(trimmed)) {
    const chunks = chunkText(trimmed, chunkSize, overlap);
    return chunks.map(c => ({ content: c }));
  }

  // Extract tables and split text around them
  const tables = extractAllTables(trimmed);
  if (tables.length === 0) {
    const chunks = chunkText(trimmed, chunkSize, overlap);
    return chunks.map(c => ({ content: c }));
  }

  const result: ChunkWithMetadata[] = [];
  let remainingText = trimmed;

  for (const table of tables) {
    // Reconstruct the table markdown for storage
    const tableMarkdown = reconstructTableMarkdown(table);

    // Find the table in the text
    const tableIndex = remainingText.indexOf(tableMarkdown);
    if (tableIndex === -1) {
      // Try to find by header match
      const headerLine = table.headers.join(' | ');
      const headerIdx = remainingText.indexOf(headerLine);
      if (headerIdx === -1) continue;

      // Extract the table region
      const lines = remainingText.split('\n');
      let startLine = -1;
      let endLine = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(headerLine)) {
          startLine = i;
          // Find end of table (next non-pipe line or empty)
          for (let j = i + 1; j < lines.length; j++) {
            if (!lines[j].includes('|') && lines[j].trim() !== '') {
              endLine = j;
              break;
            }
          }
          if (endLine === -1) endLine = lines.length;
          break;
        }
      }

      if (startLine === -1) continue;
      const before = lines.slice(0, startLine).join('\n').trim();
      const tableText = lines.slice(startLine, endLine).join('\n').trim();
      const after = lines.slice(endLine).join('\n').trim();

      if (before) {
        const beforeChunks = chunkText(before, chunkSize, overlap);
        beforeChunks.forEach(c => result.push({ content: c }));
      }

      result.push({
        content: tableText,
        tableHeaders: table.headers,
        isTableData: true,
      });

      remainingText = after;
      continue;
    }

    const before = remainingText.slice(0, tableIndex).trim();
    const after = remainingText.slice(tableIndex + tableMarkdown.length).trim();

    if (before) {
      const beforeChunks = chunkText(before, chunkSize, overlap);
      beforeChunks.forEach(c => result.push({ content: c }));
    }

    result.push({
      content: tableMarkdown,
      tableHeaders: table.headers,
      isTableData: true,
    });

    remainingText = after;
  }

  // Add any remaining text after the last table
  if (remainingText.trim()) {
    const afterChunks = chunkText(remainingText.trim(), chunkSize, overlap);
    afterChunks.forEach(c => result.push({ content: c }));
  }

  return result.filter(c => c.content.length > 0);
}

function reconstructTableMarkdown(table: ParsedTable): string {
  const headerLine = '| ' + table.headers.join(' | ') + ' |';
  const separator = '| ' + table.headers.map(() => '---').join(' | ') + ' |';
  const rowLines = table.rows.map(r => '| ' + r.join(' | ') + ' |');
  return [headerLine, separator, ...rowLines].join('\n');
}

export async function pickAndProcessDocument(): Promise<Document> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'image/*'],
    copyToCacheDirectory: true,
  });

  if (result.canceled) throw new Error('Document selection cancelled');

  const file = result.assets[0];

  // Validate file size and type
  const fileSize = file.size || 0;
  const filename = file.name || 'document';
  const fileType = getFileType(file.mimeType, filename);

  if (fileType === 'image' && fileSize > MAX_IMAGE_SIZE) {
    throw new Error(`Image too large. Maximum size is ${MAX_IMAGE_SIZE / 1024 / 1024}MB`);
  }

  if (fileSize > MAX_FILE_SIZE) {
    throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  if (fileSize === 0) {
    throw new Error('File appears to be empty');
  }

  const docId = uuid();
  const now = new Date().toISOString();

  await ensureDocumentsDir();

  // Copy to permanent storage
  const baseUri = FileSystem.documentDirectory || 'file:///data/user/0/com.perai.app/files/';
  const sanitizedName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const destPath = `${baseUri}perai_documents/${docId}_${sanitizedName}`;

  let copied = false;
  // 1. Try legacy copyAsync first (most reliable on Android for content:// and file:// cache URIs)
  try {
    await FileSystem.copyAsync({ from: file.uri, to: destPath });
    copied = true;
  } catch (copyErr) {
    console.warn('FileSystem.copyAsync failed, trying File.copy:', copyErr);
  }

  // 2. Fallback to new File().copy() if copyAsync failed
  if (!copied) {
    try {
      const sourceFile = new File(file.uri);
      const destFile = new File(destPath);
      await sourceFile.copy(destFile);
      copied = true;
    } catch (sourceErr) {
      console.warn('sourceFile.copy failed:', sourceErr);
    }
  }

  // If both file copy methods failed, fallback to picker cache uri directly
  const finalStoragePath = copied ? destPath : file.uri;

  // Save metadata first (unprocessed)
  const db = await getSourcesDb();
  await db.runAsync(
    `INSERT INTO documents (id, filename, file_type, file_size, file_uri, uploaded_at, processed, chunk_count, updated_at, deleted, dirty)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, 0, 1)`,
    [docId, filename, fileType, fileSize, finalStoragePath, now, now]
  );

  // Extract text in background
  try {
    const text = await extractText(finalStoragePath, fileType, file.uri);

    // Validate extracted text
    if (!text || text.trim().length < MIN_TEXT_LENGTH) {
      throw new Error('Could not extract enough text from document. File may be empty or corrupted.');
    }

    const chunksWithMetadata = chunkTextWithTables(text);

    if (chunksWithMetadata.length === 0) {
      throw new Error('Document chunking failed. No searchable content created.');
    }

    // Save chunks with table metadata
    for (let i = 0; i < chunksWithMetadata.length; i++) {
      const chunk = chunksWithMetadata[i];
      await db.runAsync(
        `INSERT INTO document_chunks (id, document_id, chunk_index, content, page_number, created_at)
         VALUES (?, ?, ?, ?, NULL, ?)`,
        [uuid(), docId, i, chunk.content, now]
      );
    }

    // Mark as processed
    await db.runAsync(
      `UPDATE documents SET processed = 1, chunk_count = ?, deleted = 0, dirty = 1, updated_at = ? WHERE id = ?`,
      [chunksWithMetadata.length, now, docId]
    );

    return {
      id: docId,
      filename,
      fileType,
      fileSize,
      fileUri: finalStoragePath,
      uploadedAt: now,
      processed: true,
      chunkCount: chunksWithMetadata.length,
      updatedAt: now,
    };
  } catch (err) {
    // Clean up: delete copied file and database record on failure
    try {
      if (copied) {
        await FileSystem.deleteAsync(destPath, { idempotent: true }).catch(() => {});
      }
      await db.runAsync('DELETE FROM documents WHERE id = ?', [docId]).catch(() => {});
    } catch (cleanupErr) {
      console.warn('Cleanup failed after document processing error:', cleanupErr);
    }

    throw new Error(`Document processing failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function listDocuments(): Promise<Document[]> {
  const db = await getSourcesDb();

  // Auto-recover any documents that have search chunks in document_chunks
  // (e.g. if they were prematurely marked deleted or out-of-sync)
  await db.runAsync(`
    UPDATE documents
    SET deleted = 0,
        processed = 1,
        chunk_count = (SELECT COUNT(*) FROM document_chunks WHERE document_id = documents.id)
    WHERE (SELECT COUNT(*) FROM document_chunks WHERE document_id = documents.id) > 0
      AND (deleted = 1 OR chunk_count = 0 OR processed = 0)
  `).catch(() => {});

  const rows = await db.getAllAsync<{
    id: string;
    filename: string;
    file_type: string;
    file_size: number;
    file_uri: string;
    uploaded_at: string;
    processed: number;
    chunk_count: number;
    updated_at: string;
  }>(
    `SELECT id, filename, file_type, file_size, file_uri, uploaded_at, processed, chunk_count, updated_at
     FROM documents
     WHERE deleted = 0
     ORDER BY uploaded_at DESC`
  );

  return rows.map((row: {
    id: string;
    filename: string;
    file_type: string;
    file_size: number;
    file_uri: string;
    uploaded_at: string;
    processed: number;
    chunk_count: number;
    updated_at: string;
  }) => ({
    id: row.id,
    filename: row.filename,
    fileType: row.file_type as Document['fileType'],
    fileSize: row.file_size,
    fileUri: row.file_uri,
    uploadedAt: row.uploaded_at,
    processed: row.processed === 1,
    chunkCount: row.chunk_count || 0,
    updatedAt: row.updated_at,
  }));
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await getSourcesDb();

  // Get file path before deleting
  const doc = await db.getFirstAsync<{ file_uri: string }>(
    'SELECT file_uri FROM documents WHERE id = ?',
    [id]
  );

  // Delete file from disk
  if (doc?.file_uri) {
    try {
      const file = new File(doc.file_uri);
      if (file.exists) file.delete();
    } catch {
      try {
        await FileSystem.deleteAsync(doc.file_uri, { idempotent: true });
      } catch (err) {
        console.warn('Could not delete document file:', err);
      }
    }
  }

  // Delete all indexed search chunks for this document
  await db.runAsync('DELETE FROM document_chunks WHERE document_id = ?', [id]);

  // Mark document as deleted and dirty for cloud sync, reset chunk_count
  await db.runAsync('UPDATE documents SET deleted = 1, dirty = 1, chunk_count = 0 WHERE id = ?', [id]);
}

export async function clearAllDocuments(): Promise<number> {
  const db = await getSourcesDb();
  const docs = await db.getAllAsync<{ id: string; file_uri: string }>(
    'SELECT id, file_uri FROM documents WHERE deleted = 0'
  );
  for (const doc of docs) {
    if (doc.file_uri) {
      try {
        await FileSystem.deleteAsync(doc.file_uri, { idempotent: true }).catch(() => {});
      } catch {}
    }
  }
  await db.runAsync('UPDATE documents SET deleted = 1, dirty = 1, chunk_count = 0 WHERE deleted = 0');
  await db.runAsync('DELETE FROM document_chunks');
  return docs.length;
}

export async function cleanupEmptyDocuments(): Promise<number> {
  const db = await getSourcesDb();

  // 1. Recover active documents (deleted = 0) where chunk_count or processed was unset
  await db.runAsync(`
    UPDATE documents
    SET processed = 1,
        chunk_count = (SELECT COUNT(*) FROM document_chunks WHERE document_id = documents.id)
    WHERE deleted = 0
      AND (SELECT COUNT(*) FROM document_chunks WHERE document_id = documents.id) > 0
      AND (chunk_count = 0 OR processed = 0)
  `).catch(() => {});

  // 2. Only clean up failed abandoned items older than 2 hours that truly have 0 chunks
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const docs = await db.getAllAsync<{ id: string; file_uri: string }>(
    `SELECT id, file_uri FROM documents
     WHERE deleted = 0
       AND (chunk_count = 0 OR processed = 0)
       AND uploaded_at < ?
       AND (SELECT COUNT(*) FROM document_chunks WHERE document_id = documents.id) = 0`,
    [twoHoursAgo]
  );

  for (const doc of docs) {
    if (doc.file_uri) {
      try {
        await FileSystem.deleteAsync(doc.file_uri, { idempotent: true }).catch(() => {});
      } catch {}
    }
  }
  if (docs.length > 0) {
    const ids = docs.map((d) => `'${d.id}'`).join(',');
    await db.runAsync(`UPDATE documents SET deleted = 1 WHERE id IN (${ids})`);
  }
  return docs.length;
}

const ISLAND_PORT_ALIASES: Record<string, string[]> = {
  androth: ['and', 'andrott'],
  androt: ['and', 'androth'],
  kalpeni: ['klp'],
  kavaratti: ['kvt'],
  agatti: ['agt'],
  amini: ['amn'],
  kadmat: ['kdm', 'kadmath'],
  kadmath: ['kdm', 'kadmat'],
  kiltan: ['klt'],
  chetlat: ['cht'],
  bitra: ['btr'],
  minicoy: ['mcy'],
  cochin: ['kochi'],
  kochi: ['cochin'],
};

export async function searchDocumentChunks(query: string, limit = 50): Promise<DocumentChunk[]> {
  const db = await getSourcesDb();
  const rawWords = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  const keywordsSet = new Set<string>();

  for (const w of rawWords) {
    if (w.length > 2) keywordsSet.add(w);
    if (w === 'shiip') keywordsSet.add('ship');
    const aliases = ISLAND_PORT_ALIASES[w];
    if (aliases) {
      aliases.forEach(a => keywordsSet.add(a));
    }
  }

  const keywords = Array.from(keywordsSet);
  if (keywords.length === 0) return [];

  // Simple keyword matching - could be enhanced with FTS5 or embeddings
  const conditions = keywords.map(() => 'LOWER(content) LIKE ?').join(' OR ');
  const params = keywords.map(k => `%${k}%`);

  // Find matched chunks and their document metadata
  const rows = await db.getAllAsync<{
    id: string;
    document_id: string;
    chunk_index: number;
    filename: string;
    chunk_count: number;
  }>(
    `SELECT c.id, c.document_id, c.chunk_index, d.filename, d.chunk_count
     FROM document_chunks c
     JOIN documents d ON c.document_id = d.id
     WHERE d.deleted = 0 AND d.processed = 1 AND (${conditions})
     LIMIT ?`,
    [...params, limit]
  );

  if (rows.length === 0) return [];

  // Group matched document IDs and the specific indices that matched
  const matchedDocs = new Map<string, { chunkCount: number; matchedIndices: Set<number> }>();
  for (const r of rows) {
    if (!matchedDocs.has(r.document_id)) {
      matchedDocs.set(r.document_id, {
        chunkCount: r.chunk_count || 1,
        matchedIndices: new Set(),
      });
    }
    matchedDocs.get(r.document_id)!.matchedIndices.add(r.chunk_index);
  }

  // Retrieve sequential context: for documents with <= 12 chunks (schedules, notices, letters),
  // retrieve all chunks in order so tables across page breaks remain whole!
  // For large documents, retrieve the matched chunk plus adjacent preceding and succeeding chunks.
  const allDocIds = Array.from(matchedDocs.keys());
  const docPlaceholders = allDocIds.map(() => '?').join(',');

  const allCandidateChunks = await db.getAllAsync<{
    id: string;
    document_id: string;
    chunk_index: number;
    content: string;
    page_number: number | null;
    created_at: string;
    filename: string;
  }>(
    `SELECT c.id, c.document_id, c.chunk_index, c.content, c.page_number, c.created_at, d.filename
     FROM document_chunks c
     JOIN documents d ON c.document_id = d.id
     WHERE c.document_id IN (${docPlaceholders}) AND d.deleted = 0
     ORDER BY c.document_id, c.chunk_index ASC`,
    allDocIds
  );

  const finalChunks: typeof allCandidateChunks = [];
  for (const c of allCandidateChunks) {
    const meta = matchedDocs.get(c.document_id);
    if (!meta) continue;
    if (meta.chunkCount <= 25) {
      finalChunks.push(c);
    } else {
      const isNearMatch = Array.from(meta.matchedIndices).some(
        (mIdx) => Math.abs(mIdx - c.chunk_index) <= 1
      );
      if (isNearMatch) {
        finalChunks.push(c);
      }
    }
  }

  // For table-based documents (schedules), also gather chunks from the same document
  // that contain ship names or port codes to enable column-wise voyage lookup
  for (const docId of allDocIds) {
    const doc = await db.getFirstAsync<{ filename: string; file_type: string }>(
      'SELECT filename, file_type FROM documents WHERE id = ?',
      [docId]
    );

    if (doc?.file_type === 'pdf') {
      // For PDF documents, retrieve all chunks to enable column-wise search
      const pdfChunks = await db.getAllAsync<{
        id: string;
        document_id: string;
        chunk_index: number;
        content: string;
        page_number: number | null;
        created_at: string;
        filename: string;
      }>(
        `SELECT c.id, c.document_id, c.chunk_index, c.content, c.page_number, c.created_at, d.filename
         FROM document_chunks c
         JOIN documents d ON c.document_id = d.id
         WHERE c.document_id = ? AND d.deleted = 0
         ORDER BY c.chunk_index ASC`,
        [docId]
      );

      // Add chunks from this document that weren't already included
      for (const c of pdfChunks) {
        if (!finalChunks.some(f => f.id === c.id)) {
          finalChunks.push(c);
        }
      }
    }
  }

  // Deduplicate by id
  const uniqueChunks = finalChunks.filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i);

  return uniqueChunks.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    pageNumber: row.page_number,
    createdAt: row.created_at,
    filename: row.filename,
  }));
}

export async function getDocument(id: string): Promise<Document | null> {
  const db = await getSourcesDb();
  const row = await db.getFirstAsync<{
    id: string;
    filename: string;
    file_type: string;
    file_size: number;
    file_uri: string;
    uploaded_at: string;
    processed: number;
    chunk_count: number;
    updated_at: string;
  }>(
    `SELECT id, filename, file_type, file_size, file_uri, uploaded_at, processed, chunk_count, updated_at
     FROM documents
     WHERE id = ? AND deleted = 0`,
    [id]
  );

  if (!row) return null;

  return {
    id: row.id,
    filename: row.filename,
    fileType: row.file_type as Document['fileType'],
    fileSize: row.file_size,
    fileUri: row.file_uri,
    uploadedAt: row.uploaded_at,
    processed: row.processed === 1,
    chunkCount: row.chunk_count || 0,
    updatedAt: row.updated_at,
  };
}

export async function getTotalDocumentChunks(): Promise<number> {
  const db = await getSourcesDb();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM document_chunks WHERE document_id IN (SELECT id FROM documents WHERE deleted = 0)'
  );
  return row?.count || 0;
}

export async function getDocumentChunks(documentId: string): Promise<DocumentChunk[]> {
  const db = await getSourcesDb();
  const rows = await db.getAllAsync<{
    id: string;
    document_id: string;
    chunk_index: number;
    content: string;
    page_number: number | null;
    created_at: string;
  }>(
    `SELECT id, document_id, chunk_index, content, page_number, created_at
     FROM document_chunks
     WHERE document_id = ?
     ORDER BY chunk_index ASC`,
    [documentId]
  );
  return rows.map(r => ({
    id: r.id,
    documentId: r.document_id,
    chunkIndex: r.chunk_index,
    content: r.content,
    pageNumber: r.page_number,
    createdAt: r.created_at,
  }));
}


