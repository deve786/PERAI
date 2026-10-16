/**
 * Runs the app's real DDL against Node's built-in SQLite and does an
 * insert/read round-trip.
 *
 *   npm run test:schema
 *
 * expo-sqlite itself cannot run outside the app, but the SQL is identical, so
 * this catches DDL and column-name mistakes without an emulator.
 */
import { DatabaseSync } from 'node:sqlite';
import { ADDED_COLUMNS, BACKFILL_SQL, CREATE_TABLE_SQL } from '../src/db/schema';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}`);
    if (detail !== undefined) console.log('        got:', detail);
  }
}

const db = new DatabaseSync(':memory:');

console.log('\nschema');
try {
  db.exec(CREATE_TABLE_SQL);
  check('DDL executes', true);
} catch (err) {
  check('DDL executes', false, (err as Error).message);
  process.exit(1);
}

// Applying it twice must be a no-op (it runs on every app start).
try {
  db.exec(CREATE_TABLE_SQL);
  check('DDL is idempotent', true);
} catch (err) {
  check('DDL is idempotent', false, (err as Error).message);
}

const columns = db
  .prepare('PRAGMA table_info(memories)')
  .all()
  .map((row) => (row as { name: string }).name);

const EXPECTED = [
  'id', 'raw_input', 'title', 'type', 'category', 'event_date',
  'date_expression', 'created_at', 'amount', 'currency', 'people',
  'location', 'tags', 'priority', 'status', 'confirmed',
  'updated_at', 'deleted', 'dirty', 'repeat', 'end_date', 'group_name',
];

check(
  'all 22 columns present',
  EXPECTED.every((c) => columns.includes(c)) && columns.length === EXPECTED.length,
  columns
);

const indexes = db
  .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='memories'")
  .all()
  .map((row) => (row as { name: string }).name);

check(
  'event_date index created',
  indexes.some((n) => n.includes('event_date')),
  indexes
);

console.log('\nround-trip');

db.prepare(
  `INSERT INTO memories (id, raw_input, title, type, category, event_date,
    date_expression, created_at, amount, currency, people, location, tags,
    priority, status, confirmed)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
).run(
  'test-1',
  'I got my haircut today',
  'Got a haircut',
  'memory',
  'Personal Care',
  '2026-09-16T12:00:00.000Z',
  'today',
  '2026-09-16T12:05:00.000Z',
  null,
  null,
  null,
  null,
  'haircut',
  null,
  'active',
  1
);

const row = db.prepare('SELECT * FROM memories WHERE id = ?').get('test-1') as
  | Record<string, unknown>
  | undefined;

check('row reads back', row !== undefined);
check('title preserved', row?.title === 'Got a haircut', row?.title);
check('nullable amount stays null', row?.amount === null, row?.amount);
check('confirmed stored as 1', row?.confirmed === 1, row?.confirmed);
check('date_expression preserved', row?.date_expression === 'today', row?.date_expression);

// The default is what an INSERT omitting status relies on.
db.prepare(
  `INSERT INTO memories (id, raw_input, title, type, category, event_date, created_at)
   VALUES (?,?,?,?,?,?,?)`
).run('test-2', 'walk', 'Went for a walk', 'memory', 'Fitness', '2026-09-16T12:00:00.000Z', '2026-09-16T12:00:00.000Z');

const defaulted = db.prepare('SELECT * FROM memories WHERE id = ?').get('test-2') as
  | Record<string, unknown>
  | undefined;

check('status defaults to active', defaulted?.status === 'active', defaulted?.status);
check('confirmed defaults to 0', defaulted?.confirmed === 0, defaulted?.confirmed);

const ordered = db
  .prepare('SELECT id FROM memories ORDER BY event_date DESC')
  .all()
  .map((r) => (r as { id: string }).id);
check('orders by event_date', ordered.length === 2, ordered);

console.log('\nrecent questions');
{
  // Same statements as saveQuestion() in src/db/queries.ts.
  const upsert = db.prepare(
    `INSERT INTO questions (text, asked_at) VALUES (?, ?)
     ON CONFLICT(text) DO UPDATE SET asked_at = excluded.asked_at`
  );
  upsert.run('When did I last cut my hair?', '2026-09-16T10:00:00.000Z');
  upsert.run('How much did I spend?', '2026-09-16T11:00:00.000Z');
  upsert.run('When did I last cut my hair?', '2026-09-16T12:00:00.000Z');

  const rows = db
    .prepare('SELECT text FROM questions ORDER BY asked_at DESC LIMIT 5')
    .all()
    .map((r) => (r as { text: string }).text);

  check('asking again does not duplicate', rows.length === 2, rows);
  check('asking again moves it to the top', rows[0] === 'When did I last cut my hair?', rows);

  for (let i = 0; i < 25; i++) upsert.run(`question ${i}`, `2026-09-17T00:00:${String(i).padStart(2, '0')}.000Z`);
  db.exec(
    `DELETE FROM questions WHERE text NOT IN
       (SELECT text FROM questions ORDER BY asked_at DESC LIMIT 20)`
  );
  const kept = (db.prepare('SELECT COUNT(*) AS n FROM questions').get() as { n: number }).n;
  check('history is capped at 20', kept === 20, kept);
}

console.log('\nlearned spellings');
{
  // Same statement as rememberSpelling() in src/db/queries.ts.
  const remember = db.prepare(
    `INSERT INTO spellings (heard, correct, source, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(heard) DO UPDATE SET
       correct = excluded.correct,
       source = excluded.source,
       updated_at = excluded.updated_at
     WHERE excluded.source = 'user' OR spellings.source = 'search'`
  );
  const correctFor = (heard: string) =>
    (db.prepare('SELECT correct FROM spellings WHERE heard = ?').get(heard) as
      | { correct: string }
      | undefined)?.correct;

  remember.run('ghost of yachty', 'Ghost of Yotei', 'search', '2026-09-18T10:00:00.000Z');
  check('a searched spelling is stored', correctFor('ghost of yachty') === 'Ghost of Yotei');

  remember.run('ghost of yachty', 'Ghost of Yōtei', 'user', '2026-09-18T11:00:00.000Z');
  check('your own correction replaces it', correctFor('ghost of yachty') === 'Ghost of Yōtei');

  remember.run('ghost of yachty', 'Ghost of Yotei', 'search', '2026-09-18T12:00:00.000Z');
  check('a later search cannot undo your correction', correctFor('ghost of yachty') === 'Ghost of Yōtei');
}

console.log('\nnotes waiting to be filed');
{
  db.prepare(
    `INSERT INTO pending_notes (id, text, created_at, attempts, last_attempt_at, last_error)
     VALUES (?, ?, ?, 0, ?, ?)`
  ).run('p1', 'remind me to call mom', '2026-09-18T10:00:00.000Z', '2026-09-18T10:00:00.000Z', 'quota');

  db.prepare(
    `UPDATE pending_notes SET attempts = attempts + 1, last_attempt_at = ?, last_error = ? WHERE id = ?`
  ).run('2026-09-18T10:05:00.000Z', 'quota again', 'p1');

  const row = db.prepare('SELECT * FROM pending_notes WHERE id = ?').get('p1') as {
    text: string;
    attempts: number;
    last_error: string;
  };
  check('a queued note keeps its words', row.text === 'remind me to call mom');
  check('a failed try is counted', row.attempts === 1, row.attempts);
  check('the reason is kept for the screen', row.last_error === 'quota again');

  db.prepare('DELETE FROM pending_notes WHERE id = ?').run('p1');
  const left = (db.prepare('SELECT COUNT(*) AS n FROM pending_notes').get() as { n: number }).n;
  check('filing it removes it from the queue', left === 0);
}

console.log('\ntitles waiting to be checked');
{
  const queue = db.prepare(
    `INSERT INTO pending_titles (id, title, type, created_at, attempts, last_attempt_at, last_error)
     VALUES (?, ?, ?, ?, 0, NULL, NULL)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, attempts = 0, last_attempt_at = NULL`
  );
  queue.run('mem-1', 'ghost of yotei', 'play', '2026-10-03T10:00:00.000Z');
  db.prepare(
    'UPDATE pending_titles SET attempts = attempts + 1, last_attempt_at = ?, last_error = ? WHERE id = ?'
  ).run('2026-10-03T10:01:00.000Z', 'quota', 'mem-1');

  const row = db.prepare('SELECT * FROM pending_titles WHERE id = ?').get('mem-1') as {
    title: string;
    type: string;
    attempts: number;
  };
  check('a title waits with its entry id', row.title === 'ghost of yotei' && row.type === 'play');
  check('a failed search is counted', row.attempts === 1, row.attempts);

  // Adding the same entry again starts its attempts over.
  queue.run('mem-1', 'ghost of yotei', 'play', '2026-10-03T11:00:00.000Z');
  const requeued = db.prepare('SELECT attempts FROM pending_titles WHERE id = ?').get('mem-1') as { attempts: number };
  check('queueing it again resets the attempts', requeued.attempts === 0);

  db.prepare('DELETE FROM pending_titles WHERE id = ?').run('mem-1');
  const left = (db.prepare('SELECT COUNT(*) AS n FROM pending_titles').get() as { n: number }).n;
  check('a checked title leaves the queue', left === 0);
}

console.log('\nupgrading a phone that predates sync');
{
  // The table exactly as it shipped before syncing existed.
  const old = new DatabaseSync(':memory:');
  old.exec(`
    CREATE TABLE memories (
      id TEXT PRIMARY KEY NOT NULL, raw_input TEXT NOT NULL, title TEXT NOT NULL,
      type TEXT NOT NULL, category TEXT NOT NULL, event_date TEXT NOT NULL,
      date_expression TEXT, created_at TEXT NOT NULL, amount REAL, currency TEXT,
      people TEXT, location TEXT, tags TEXT, priority TEXT,
      status TEXT NOT NULL DEFAULT 'active', confirmed INTEGER NOT NULL DEFAULT 0
    );
  `);
  old.prepare(
    `INSERT INTO memories (id, raw_input, title, type, category, event_date, created_at, status, confirmed)
     VALUES ('old-1', 'got a haircut', 'Got a haircut', 'memory', 'Personal Care',
             '2026-09-01T12:00:00.000Z', '2026-09-01T12:05:00.000Z', 'active', 1)`
  ).run();

  // Same steps as migrate() in src/db/client.ts.
  const columnsOf = () =>
    old.prepare('PRAGMA table_info(memories)').all().map((r) => (r as { name: string }).name);
  const before = columnsOf();
  for (const column of ADDED_COLUMNS) {
    if (!before.includes(column.name)) old.exec(column.ddl);
  }
  old.exec(BACKFILL_SQL);

  const after = columnsOf();
  check(
    'the sync columns are added to an existing table',
    ['updated_at', 'deleted', 'dirty', 'repeat', 'end_date', 'group_name'].every((c) => after.includes(c)),
    after
  );

  const row = old.prepare('SELECT * FROM memories WHERE id = ?').get('old-1') as {
    title: string;
    updated_at: string;
    deleted: number;
    dirty: number;
  };
  check('the entry itself is untouched', row.title === 'Got a haircut');
  check('it is given a time to sort by', row.updated_at === '2026-09-01T12:05:00.000Z', row.updated_at);
  check('it is not treated as deleted', row.deleted === 0);
  check('it is queued to go up on the first sync', row.dirty === 1);

  // Running it twice must change nothing, since it runs on every launch.
  for (const column of ADDED_COLUMNS) {
    if (!columnsOf().includes(column.name)) old.exec(column.ddl);
  }
  old.exec(BACKFILL_SQL);
  check('running the upgrade again is harmless', columnsOf().length === after.length);
  old.close();
}

db.close();

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
