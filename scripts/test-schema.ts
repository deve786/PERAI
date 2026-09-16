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
import { CREATE_TABLE_SQL } from '../src/db/schema';

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
];

check(
  'all 16 columns present',
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

db.close();

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
