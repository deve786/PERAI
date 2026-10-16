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
  confirmed INTEGER NOT NULL DEFAULT 0,
  -- 'daily' | 'weekly' | 'monthly', or null for a one-off. A repeating entry
  -- moves to its next occurrence when ticked off instead of closing.
  repeat TEXT,
  -- Optional closing date, so an entry can cover a span (a trip) rather than
  -- a moment. Null for everything that existed before.
  end_date TEXT,
  -- The group this entry belongs to, by name. Null for anything on its own.
  group_name TEXT,
  -- Sync bookkeeping. A deleted entry stays as a tombstone until the server has
  -- seen it, or the delete would come straight back on the next pull.
  updated_at TEXT NOT NULL DEFAULT '',
  deleted INTEGER NOT NULL DEFAULT 0,
  dirty INTEGER NOT NULL DEFAULT 1
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

-- A short diary of what the app actually did: saves, backups, name checks and
-- anything that failed, with the reason. Only things worth reading — this is
-- for answering "why did that not work", not a developer trace.
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  level TEXT NOT NULL,
  event TEXT NOT NULL,
  detail TEXT
);

-- Titles waiting to be checked against a web search. The entry is already
-- saved and usable; this is only its spelling catching up, and it survives the
-- app being closed so a slow search is never simply lost.
CREATE TABLE IF NOT EXISTS pending_titles (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  last_error TEXT
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

/**
 * Columns added to `memories` after the first release.
 *
 * CREATE TABLE IF NOT EXISTS does nothing to a table that already exists, so
 * phones that have been running since before sync need these added by hand.
 * Applied by migrate() in client.ts, which skips whatever is already there.
 */
export const ADDED_COLUMNS: { name: string; ddl: string }[] = [
  { name: 'updated_at', ddl: "ALTER TABLE memories ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''" },
  { name: 'deleted', ddl: 'ALTER TABLE memories ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0' },
  { name: 'dirty', ddl: 'ALTER TABLE memories ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1' },
  { name: 'repeat', ddl: 'ALTER TABLE memories ADD COLUMN repeat TEXT' },
  { name: 'end_date', ddl: 'ALTER TABLE memories ADD COLUMN end_date TEXT' },
  { name: 'group_name', ddl: 'ALTER TABLE memories ADD COLUMN group_name TEXT' },
];

/** Entries from before sync existed still need a time and a push. */
export const BACKFILL_SQL = `
UPDATE memories SET updated_at = created_at WHERE updated_at = '';
`;
