/**
 * Database schema for multi-source data (documents, websites, Telegram).
 */

export const SOURCES_SCHEMA = `
-- Document metadata table
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY NOT NULL,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_uri TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  processed INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  dirty INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_documents_uploaded ON documents (uploaded_at DESC);

-- Document chunks for retrieval
CREATE TABLE IF NOT EXISTS document_chunks (
  id TEXT PRIMARY KEY NOT NULL,
  document_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  page_number INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks (document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_content ON document_chunks (content);

-- Website data cache
CREATE TABLE IF NOT EXISTS website_data (
  id TEXT PRIMARY KEY NOT NULL,
  url TEXT NOT NULL UNIQUE,
  title TEXT,
  content TEXT NOT NULL,
  scraped_at TEXT NOT NULL,
  last_updated TEXT NOT NULL,
  refresh_interval INTEGER DEFAULT 86400,
  auto_refresh INTEGER NOT NULL DEFAULT 1,
  deleted INTEGER NOT NULL DEFAULT 0,
  dirty INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_website_url ON website_data (url);
CREATE INDEX IF NOT EXISTS idx_website_updated ON website_data (last_updated DESC);

-- Telegram channel messages
CREATE TABLE IF NOT EXISTS telegram_messages (
  id TEXT PRIMARY KEY NOT NULL,
  channel_id TEXT NOT NULL,
  channel_name TEXT,
  message_id INTEGER NOT NULL,
  message_text TEXT,
  message_date TEXT NOT NULL,
  sender_name TEXT,
  media_type TEXT,
  media_path TEXT,
  synced_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  UNIQUE(channel_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_channel ON telegram_messages (channel_id);
CREATE INDEX IF NOT EXISTS idx_telegram_date ON telegram_messages (message_date DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_text ON telegram_messages (message_text);

-- Telegram channels configuration
CREATE TABLE IF NOT EXISTS telegram_channels (
  id TEXT PRIMARY KEY NOT NULL,
  channel_username TEXT NOT NULL UNIQUE,
  channel_name TEXT,
  last_message_id INTEGER,
  last_synced_at TEXT,
  auto_sync INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
`;

export const DATABASE_NAME = 'perai_sources.db';
