/**
 * Document upload, processing, and retrieval.
 */
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { getSourcesDb, uuid } from './client';
import { extractText } from './extractors';

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
}

const DOCUMENTS_DIR = `file:///data/user/0/com.perai.app/files/perai_documents/`;

// File size limits (in bytes)
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB for images (OCR is expensive)
const MIN_TEXT_LENGTH = 10; // Minimum characters after extraction

async function ensureDocumentsDir() {
  const dir = new File(DOCUMENTS_DIR);
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
}

function getFileType(mimeType?: string): Document['fileType'] {
  if (!mimeType) return 'other';
  if (mimeType.includes('pdf')) return 'pdf';
  if (mimeType.includes('wordprocessingml')) return 'docx';
  if (mimeType.includes('text/plain')) return 'txt';
  if (mimeType.includes('image/')) return 'image';
  return 'other';
}

/**
 * Chunk text into smaller pieces for better retrieval.
 * Overlapping chunks help maintain context.
 */
function chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end).trim());
    start += chunkSize - overlap;
  }

  return chunks.filter(c => c.length > 0);
}

export async function pickAndProcessDocument(): Promise<Document> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'image/*'],
    copyToCacheDirectory: true,
  });

  if (result.canceled) throw new Error('Document selection cancelled');

  const file = result.assets[0];

  // Validate file size
  const fileSize = file.size || 0;
  const fileType = getFileType(file.mimeType);

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
  const filename = file.name;
  const now = new Date().toISOString();

  await ensureDocumentsDir();

  // Copy to permanent storage
  const destPath = `${DOCUMENTS_DIR}${docId}_${filename}`;

  try {
    const sourceFile = new File(file.uri);
    const destFile = new File(destPath);
    sourceFile.copy(destFile);
  } catch (err) {
    throw new Error(`Failed to save file: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Save metadata first (unprocessed)
  const db = await getSourcesDb();
  await db.runAsync(
    `INSERT INTO documents (id, filename, file_type, file_size, file_uri, uploaded_at, processed, chunk_count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)`,
    [docId, filename, fileType, fileSize, destPath, now, now]
  );

  // Extract text in background
  try {
    const text = await extractText(destPath, fileType);

    // Validate extracted text
    if (!text || text.trim().length < MIN_TEXT_LENGTH) {
      throw new Error('Could not extract enough text from document. File may be empty or corrupted.');
    }

    const chunks = chunkText(text);

    if (chunks.length === 0) {
      throw new Error('Document chunking failed. No searchable content created.');
    }

    // Save chunks
    for (let i = 0; i < chunks.length; i++) {
      await db.runAsync(
        `INSERT INTO document_chunks (id, document_id, chunk_index, content, page_number, created_at)
         VALUES (?, ?, ?, ?, NULL, ?)`,
        [uuid(), docId, i, chunks[i], now]
      );
    }

    // Mark as processed
    await db.runAsync(
      `UPDATE documents SET processed = 1, chunk_count = ? WHERE id = ?`,
      [chunks.length, docId]
    );

    return {
      id: docId,
      filename,
      fileType,
      fileSize,
      fileUri: destPath,
      uploadedAt: now,
      processed: true,
      chunkCount: chunks.length,
      updatedAt: now,
    };
  } catch (err) {
    // Clean up: delete file and database record on failure
    try {
      const destFile = new File(destPath);
      if (destFile.exists) destFile.delete();
      await db.runAsync('DELETE FROM documents WHERE id = ?', [docId]);
    } catch (cleanupErr) {
      console.warn('Cleanup failed after document processing error:', cleanupErr);
    }

    throw new Error(`Document processing failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function listDocuments(): Promise<Document[]> {
  const db = await getSourcesDb();
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
    } catch (err) {
      console.warn('Could not delete document file:', err);
    }
  }

  // Soft delete from database (chunks cascade delete)
  await db.runAsync('UPDATE documents SET deleted = 1 WHERE id = ?', [id]);
}

export async function searchDocumentChunks(query: string, limit = 50): Promise<DocumentChunk[]> {
  const db = await getSourcesDb();
  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  if (keywords.length === 0) return [];

  // Simple keyword matching - could be enhanced with FTS5 or embeddings
  const conditions = keywords.map(() => 'LOWER(content) LIKE ?').join(' OR ');
  const params = keywords.map(k => `%${k}%`);

  const rows = await db.getAllAsync<{
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
     WHERE d.deleted = 0 AND d.processed = 1 AND (${conditions})
     LIMIT ?`,
    [...params, limit]
  );

  return rows.map((row: {
    id: string;
    document_id: string;
    chunk_index: number;
    content: string;
    page_number: number | null;
    created_at: string;
    filename: string;
  }) => ({
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
