/**
 * The table definition, as plain SQL.
 *
 * Applied on every app start via `initDatabase()`. Single-table and
 * deliberately denormalised — `people` and `tags` are comma-separated strings
 * rather than join tables, which is plenty for a single-user MVP.
 */
export const CREATE_TABLE_SQL = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY NOT NULL,
  raw_input TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  event_date TEXT NOT NULL,
  date_expression TEXT,
  created_at TEXT NOT NULL,
  amount REAL,
  currency TEXT,
  people TEXT,
  location TEXT,
  tags TEXT,
  priority TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  confirmed INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_memories_event_date ON memories (event_date DESC);
CREATE INDEX IF NOT EXISTS idx_memories_category ON memories (category);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories (type);

-- Questions asked on the Ask tab, so they can be asked again with one tap.
-- One row per distinct question; asking it again just moves it to the top.
CREATE TABLE IF NOT EXISTS questions (
  text TEXT PRIMARY KEY NOT NULL,
  asked_at TEXT NOT NULL
);

-- Small key/value store for app preferences (theme mode, speech language).
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

-- Spellings the app has learned, so a title is only ever looked up once.
-- "heard" is the normalised form of what speech recognition produced, and
-- "source" is 'user' for a correction typed in the preview screen, or
-- 'search' for one confirmed by a web search.
CREATE TABLE IF NOT EXISTS spellings (
  heard TEXT PRIMARY KEY NOT NULL,
  correct TEXT NOT NULL,
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Notes that could not be filed yet (offline, or the AI quota ran out). They
-- are retried automatically; nothing spoken is lost while one waits here.
CREATE TABLE IF NOT EXISTS pending_notes (
  id TEXT PRIMARY KEY NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  last_error TEXT
);
`;

export const DATABASE_NAME = 'perai.db';
