/**
 * Types for multi-source data.
 */

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
  // For display
  filename?: string;
}

export interface WebsiteData {
  id: string;
  url: string;
  title: string | null;
  content: string;
  scrapedAt: string;
  lastUpdated: string;
  refreshInterval: number;
  autoRefresh: boolean;
}

export interface TelegramMessage {
  id: string;
  channelId: string;
  channelName: string | null;
  messageId: number;
  messageText: string | null;
  messageDate: string;
  senderName: string | null;
  mediaType: 'photo' | 'video' | 'document' | 'none';
  mediaPath: string | null;
  syncedAt: string;
}

export interface TelegramChannel {
  id: string;
  channelUsername: string;
  channelName: string | null;
  lastMessageId: number | null;
  lastSyncedAt: string | null;
  autoSync: boolean;
  createdAt: string;
}

export type SourceType = 'memory' | 'expense' | 'document' | 'website' | 'telegram';

export interface SearchResult {
  type: SourceType;
  content: string;
  metadata: Record<string, unknown>;
  relevanceScore: number;
}
