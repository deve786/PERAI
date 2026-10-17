import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { linkId } from './tripSpending';
import { todayStr, ymKey } from './dates';

export type Category = { id: string; name: string; icon: string; color: string; monthly_budget: number | null };
export type TaggedUser = { id: string; name: string };
export type Expense = {
  id: string;
  amount: number;
  category_id: string;
  date: string; // YYYY-MM-DD
  note: string;
  notes: string;
  method: string;
  user_tag?: string;
  recurring_id: string | null;
  /** The bank account a UPI (or other bank-drawn) payment came from — its balance is kept in step. Null/absent when not linked to one. */
  account_id?: string | null;
  /** 1 once a refund has been entered for this expense (e.g. a refunded Ticket). 0/absent otherwise. */
  cancelled?: number;
  /** How much of this expense was refunded. Null/absent when nothing has been. */
  refund_amount?: number | null;
  /** The bank account the refund landed in, if any — set via setExpenseRefund. */
  refund_account_id?: string | null;
  /** The Income row (Refund category) recording the refund, so editing or clearing it updates that same row instead of creating another. */
  refund_income_id?: string | null;
};
export type ExpenseRow = Expense & { cat_name: string; cat_icon: string; cat_color: string; item_count: number };
export type ExpenseItem = { id: string; expense_id: string; name: string; quantity: number; amount: number };
export type Recurring = {
  id: string;
  amount: number;
  category_id: string;
  note: string;
  method: string;
  day: number;
  last_ym: string;
  cat_name?: string;
};

export type Income = {
  id: string;
  amount: number;
  category_id: string;
  date: string;
  note: string;
  notes: string;
  method: string;
  user_tag?: string;
  /** The bank account UPI income landed in — its balance is kept in step. Null/absent when not linked to one. */
  account_id?: string | null;
};
export type IncomeRow = Income & { cat_name: string; cat_icon: string; cat_color: string };

export const METHODS = ['Cash', 'UPI', 'Card', 'Bank'] as const;

/** RFC4122-ish v4 id — stable and globally unique, so rows created on different
 *  devices (or restored from a backup) never collide. Not cryptographically
 *  secure randomness; that isn't needed for a row identifier. */
export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const nowIso = () => new Date().toISOString();

// Hue order is deliberate: warm and cool alternate so neighbouring swatches stay
// distinguishable for red-green colour blindness. Validated, don't reorder casually.
type CategorySeed = Pick<Category, 'name' | 'icon' | 'color'>;

/** Seeds carry no budget, so seeding can never touch one the user set. */
const DEFAULT_CATEGORIES: CategorySeed[] = [
  { name: 'Food', icon: 'restaurant-outline', color: '#C8553D' },
  { name: 'Transport', icon: 'car-outline', color: '#2E7DB8' },
  { name: 'Shopping', icon: 'bag-handle-outline', color: '#A8831F' },
  { name: 'Bills', icon: 'receipt-outline', color: '#7159C4' },
  { name: 'Rent', icon: 'home-outline', color: '#2E9465' },
  { name: 'Health', icon: 'medkit-outline', color: '#B0479B' },
  { name: 'Entertainment', icon: 'film-outline', color: '#7B8B1E' },
  { name: 'Ticket', icon: 'ticket-outline', color: '#C46210' },
  { name: 'Other', icon: 'ellipsis-horizontal-circle-outline', color: '#0D8FAF' },
];

/** Colours shipped before the muted palette, keyed by category name. */
const LEGACY_COLORS: Record<string, string> = {
  Food: '#E4572E', Transport: '#2E86AB', Shopping: '#A23B72', Bills: '#F18F01',
  Rent: '#5C6B73', Health: '#3BB273', Entertainment: '#7768AE', Other: '#8D99AE',
};

const DEFAULT_INCOME_CATEGORIES: CategorySeed[] = [
  { name: 'Salary', icon: 'cash-outline', color: '#C8553D' },
  { name: 'Freelance', icon: 'laptop-outline', color: '#2E7DB8' },
  { name: 'Business', icon: 'storefront-outline', color: '#A8831F' },
  { name: 'Gift', icon: 'gift-outline', color: '#7159C4' },
  { name: 'Refund', icon: 'return-up-back-outline', color: '#2E9465' },
  { name: 'Interest', icon: 'trending-up-outline', color: '#B0479B' },
  { name: 'Other', icon: 'ellipsis-horizontal-circle-outline', color: '#0D8FAF' },
];

/** Adds a column to an existing table if it isn't there yet — SQLite has no "ADD COLUMN IF NOT EXISTS". */
async function addColumnIfMissing(db: SQLite.SQLiteDatabase, table: string, column: string, definition: string) {
  const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!cols.some((c) => c.name === column)) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    dirty INTEGER NOT NULL DEFAULT 1,
    deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name ON categories(name) WHERE deleted = 0;
  CREATE TABLE IF NOT EXISTS income_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    dirty INTEGER NOT NULL DEFAULT 1,
    deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_income_categories_name ON income_categories(name) WHERE deleted = 0;
  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    amount REAL NOT NULL,
    category_id TEXT NOT NULL,
    date TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    method TEXT NOT NULL DEFAULT 'Cash',
    user_tag TEXT NOT NULL DEFAULT '',
    recurring_id TEXT,
    account_id TEXT,
    cancelled INTEGER NOT NULL DEFAULT 0,
    refund_amount REAL,
    refund_account_id TEXT,
    refund_income_id TEXT,
    updated_at TEXT NOT NULL,
    dirty INTEGER NOT NULL DEFAULT 1,
    deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
  CREATE TABLE IF NOT EXISTS tagged_users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    dirty INTEGER NOT NULL DEFAULT 1,
    deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_tagged_users_name ON tagged_users(name) WHERE deleted = 0;
  CREATE TABLE IF NOT EXISTS expense_items (
    id TEXT PRIMARY KEY,
    expense_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    quantity REAL NOT NULL DEFAULT 1,
    amount REAL NOT NULL,
    updated_at TEXT NOT NULL,
    dirty INTEGER NOT NULL DEFAULT 1,
    deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_expense_items_expense ON expense_items(expense_id);
  CREATE TABLE IF NOT EXISTS income (
    id TEXT PRIMARY KEY,
    amount REAL NOT NULL,
    category_id TEXT NOT NULL,
    date TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    method TEXT NOT NULL DEFAULT 'Cash',
    user_tag TEXT NOT NULL DEFAULT '',
    account_id TEXT,
    updated_at TEXT NOT NULL,
    dirty INTEGER NOT NULL DEFAULT 1,
    deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_income_date ON income(date);
  CREATE TABLE IF NOT EXISTS recurring (
    id TEXT PRIMARY KEY,
    amount REAL NOT NULL,
    category_id TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    method TEXT NOT NULL DEFAULT 'Cash',
    day INTEGER NOT NULL,
    last_ym TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    dirty INTEGER NOT NULL DEFAULT 1,
    deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS borrow_lend (
    id TEXT PRIMARY KEY,
    person_name TEXT NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    due_date TEXT,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    settled_amount REAL NOT NULL DEFAULT 0,
    settled_at TEXT,
    updated_at TEXT NOT NULL,
    dirty INTEGER NOT NULL DEFAULT 1,
    deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_borrow_lend_status ON borrow_lend(status);
  CREATE INDEX IF NOT EXISTS idx_borrow_lend_person ON borrow_lend(person_name);
  CREATE INDEX IF NOT EXISTS idx_borrow_lend_date ON borrow_lend(date);
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    balance REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT '₹',
    notes TEXT NOT NULL DEFAULT '',
    institution TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    dirty INTEGER NOT NULL DEFAULT 1,
    deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);
`;

type OldRow = Record<string, unknown> & { id: number };

/**
 * One-time migration from the original autoincrement-integer schema to
 * UUID primary keys, which sync requires (two devices generating integer ids
 * independently would collide). Detected by the absence of the `dirty` column
 * on `categories` — present on every table from this schema onward.
 *
 * Runs entirely inside one exclusive transaction: if the app is killed
 * mid-migration, SQLite rolls the whole thing back and the old tables are
 * still there untouched, so the next launch just retries cleanly rather than
 * risking a half-converted database. A fresh install has no old `categories`
 * table at all, so this is a no-op for new users.
 */
async function migrateLegacyIdsIfNeeded(db: SQLite.SQLiteDatabase): Promise<boolean> {
  const tables = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='categories'"
  );
  if (tables.length === 0) return false; // fresh install

  const cols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(categories)');
  if (cols.some((c) => c.name === 'dirty')) return false; // already migrated

  await db.withExclusiveTransactionAsync(async (txn) => {
    const data = {
      oldCategories: await txn.getAllAsync<OldRow>('SELECT * FROM categories'),
      oldIncomeCategories: await txn.getAllAsync<OldRow>('SELECT * FROM income_categories'),
      oldExpenses: await txn.getAllAsync<OldRow>('SELECT * FROM expenses'),
      oldExpenseItems: await txn.getAllAsync<OldRow>('SELECT * FROM expense_items'),
      oldIncome: await txn.getAllAsync<OldRow>('SELECT * FROM income'),
      oldRecurring: await txn.getAllAsync<OldRow>('SELECT * FROM recurring'),
    };

    await txn.execAsync(`
      DROP TABLE categories;
      DROP TABLE income_categories;
      DROP TABLE expenses;
      DROP TABLE expense_items;
      DROP TABLE income;
      DROP TABLE recurring;
    `);
    await txn.execAsync(SCHEMA_SQL);
    await restoreLegacyData(txn, data);
  });

  return true;
}

type LegacyData = {
  oldCategories: OldRow[]; oldIncomeCategories: OldRow[]; oldExpenses: OldRow[];
  oldExpenseItems: OldRow[]; oldIncome: OldRow[]; oldRecurring: OldRow[];
};

async function restoreLegacyData(db: SQLite.SQLiteDatabase, data: LegacyData) {
  const now = nowIso();
  const catMap = new Map(data.oldCategories.map((r) => [r.id, uuid()]));
  const incCatMap = new Map(data.oldIncomeCategories.map((r) => [r.id, uuid()]));
  const expMap = new Map(data.oldExpenses.map((r) => [r.id, uuid()]));
  const recMap = new Map(data.oldRecurring.map((r) => [r.id, uuid()]));

  for (const r of data.oldCategories) {
    await db.runAsync(
      'INSERT INTO categories (id, name, icon, color, updated_at, dirty, deleted) VALUES (?,?,?,?,?,1,0)',
      catMap.get(r.id)!, r.name as string, r.icon as string, r.color as string, now
    );
  }
  for (const r of data.oldIncomeCategories) {
    await db.runAsync(
      'INSERT INTO income_categories (id, name, icon, color, updated_at, dirty, deleted) VALUES (?,?,?,?,?,1,0)',
      incCatMap.get(r.id)!, r.name as string, r.icon as string, r.color as string, now
    );
  }
  for (const r of data.oldExpenses) {
    await db.runAsync(
      `INSERT INTO expenses (id, amount, category_id, date, note, notes, method, recurring_id, updated_at, dirty, deleted)
       VALUES (?,?,?,?,?,?,?,?,?,1,0)`,
      expMap.get(r.id)!, r.amount as number, catMap.get(r.category_id as number)!, r.date as string,
      r.note as string, (r.notes as string) ?? '', r.method as string,
      r.recurring_id ? recMap.get(r.recurring_id as number)! : null, now
    );
  }
  for (const r of data.oldExpenseItems) {
    const newExpenseId = expMap.get(r.expense_id as number);
    if (!newExpenseId) continue; // orphaned row, nothing to attach it to
    await db.runAsync(
      'INSERT INTO expense_items (id, expense_id, name, quantity, amount, updated_at, dirty, deleted) VALUES (?,?,?,?,?,?,1,0)',
      uuid(), newExpenseId, r.name as string, (r.quantity as number) ?? 1, r.amount as number, now
    );
  }
  for (const r of data.oldIncome) {
    await db.runAsync(
      `INSERT INTO income (id, amount, category_id, date, note, notes, method, updated_at, dirty, deleted)
       VALUES (?,?,?,?,?,?,?,?,1,0)`,
      uuid(), r.amount as number, incCatMap.get(r.category_id as number)!, r.date as string,
      r.note as string, (r.notes as string) ?? '', r.method as string, now
    );
  }
  for (const r of data.oldRecurring) {
    await db.runAsync(
      `INSERT INTO recurring (id, amount, category_id, note, method, day, last_ym, updated_at, dirty, deleted)
       VALUES (?,?,?,?,?,?,?,?,1,0)`,
      recMap.get(r.id)!, r.amount as number, catMap.get(r.category_id as number)!, r.note as string,
      r.method as string, r.day as number, r.last_ym as string, now
    );
  }
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb() {
  if (!dbPromise) dbPromise = init();
  return dbPromise;
}

/** Subscribe to writes (used by the sync engine to trigger a push shortly after a local change). */
export function onDatabaseChange(listener: () => void): () => void {
  const subscription = SQLite.addDatabaseChangeListener(() => listener());
  return () => subscription.remove();
}

async function init() {
  const db = await SQLite.openDatabaseAsync('spendly.db', { enableChangeListener: true });
  // WAL journal mode is not supported by the SQLite WASM backend used on web.
  if (Platform.OS !== 'web') await db.execAsync('PRAGMA journal_mode = WAL;');
  const migrated = await migrateLegacyIdsIfNeeded(db);
  if (!migrated) await db.execAsync(SCHEMA_SQL); // fresh install, or already migrated: ensure tables exist

  await addColumnIfMissing(db, 'expenses', 'notes', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(db, 'expenses', 'user_tag', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(db, 'expenses', 'account_id', 'TEXT');
  await addColumnIfMissing(db, 'income', 'user_tag', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(db, 'income', 'account_id', 'TEXT');
  await addColumnIfMissing(db, 'expenses', 'cancelled', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'expenses', 'refund_amount', 'REAL');
  await addColumnIfMissing(db, 'expenses', 'refund_account_id', 'TEXT');
  await addColumnIfMissing(db, 'expenses', 'refund_income_id', 'TEXT');
  await addColumnIfMissing(db, 'expense_items', 'quantity', "REAL NOT NULL DEFAULT 1");
  // Null means no budget, which is how every existing category starts.
  await addColumnIfMissing(db, 'categories', 'monthly_budget', 'REAL');
  // Which spending belongs to which PERAI entry (a trip, a weekend away).
  // It lives here, not in perai.db, because this zone already syncs tables
  // generically — see src/expense/sync/tables.ts. The id is derived from the
  // pair, so the same link made twice is the same row rather than a duplicate.
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS memory_expense_links (
      id TEXT PRIMARY KEY,
      memory_id TEXT NOT NULL,
      expense_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      dirty INTEGER NOT NULL DEFAULT 1,
      deleted INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_expense_pair
      ON memory_expense_links(memory_id, expense_id);
    CREATE INDEX IF NOT EXISTS idx_memory_expense_memory
      ON memory_expense_links(memory_id);
  `);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS tagged_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      dirty INTEGER NOT NULL DEFAULT 1,
      deleted INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tagged_users_name ON tagged_users(name) WHERE deleted = 0;
    CREATE TABLE IF NOT EXISTS borrow_lend (
      id TEXT PRIMARY KEY,
      person_name TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      due_date TEXT,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      settled_amount REAL NOT NULL DEFAULT 0,
      settled_at TEXT,
      updated_at TEXT NOT NULL,
      dirty INTEGER NOT NULL DEFAULT 1,
      deleted INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_borrow_lend_status ON borrow_lend(status);
    CREATE INDEX IF NOT EXISTS idx_borrow_lend_person ON borrow_lend(person_name);
    CREATE INDEX IF NOT EXISTS idx_borrow_lend_date ON borrow_lend(date);
  `);

  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM categories');
  if (!row || row.c === 0) {
    for (const c of DEFAULT_CATEGORIES) {
      await db.runAsync(
        'INSERT INTO categories (id, name, icon, color, updated_at) VALUES (?, ?, ?, ?, ?)',
        uuid(), c.name, c.icon, c.color, nowIso()
      );
    }
  } else {
    // Repaint only the defaults the user never customised, so their own picks survive.
    for (const c of DEFAULT_CATEGORIES) {
      await db.runAsync(
        "UPDATE categories SET color = ?, updated_at = ?, dirty = 1 WHERE name = ? AND color = ? AND deleted = 0",
        c.color, nowIso(), c.name, LEGACY_COLORS[c.name]
      );
    }
    // A later app update can add a new default category (e.g. "Personal Care").
    // Existing installs never ran the fresh-install seed above, so backfill
    // whichever ones they don't already have — by name, so a category the
    // user already made with that name is left alone.
    for (const c of DEFAULT_CATEGORIES) {
      const existing = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM categories WHERE LOWER(name) = LOWER(?) AND deleted = 0', c.name
      );
      if (!existing) {
        await db.runAsync(
          'INSERT INTO categories (id, name, icon, color, updated_at) VALUES (?, ?, ?, ?, ?)',
          uuid(), c.name, c.icon, c.color, nowIso()
        );
      }
    }
  }
  const incomeRow = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM income_categories');
  if (!incomeRow || incomeRow.c === 0) {
    for (const c of DEFAULT_INCOME_CATEGORIES) {
      await db.runAsync(
        'INSERT INTO income_categories (id, name, icon, color, updated_at) VALUES (?, ?, ?, ?, ?)',
        uuid(), c.name, c.icon, c.color, nowIso()
      );
    }
  }
  await generateRecurring(db);
  return db;
}

/** Create this month's entries for any recurring expense whose day has arrived. */
async function generateRecurring(db: SQLite.SQLiteDatabase) {
  const today = todayStr();
  const ym = ymKey(today);
  const dayNow = Number(today.slice(8, 10));
  const daysInMonth = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate();
  const list = await db.getAllAsync<Recurring>("SELECT * FROM recurring WHERE last_ym != ? AND deleted = 0", ym);
  for (const r of list) {
    const day = Math.min(r.day, daysInMonth);
    if (dayNow >= day) {
      const date = `${ym}-${String(day).padStart(2, '0')}`;
      await db.runAsync(
        'INSERT INTO expenses (id, amount, category_id, date, note, method, recurring_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        uuid(), r.amount, r.category_id, date, r.note, r.method, r.id, nowIso()
      );
      await db.runAsync('UPDATE recurring SET last_ym = ?, updated_at = ?, dirty = 1 WHERE id = ?', ym, nowIso(), r.id);
    }
  }
}

export async function refreshRecurring() {
  const db = await getDb();
  await generateRecurring(db);
}

// ---------- Categories ----------
export async function listCategories() {
  const db = await getDb();
  return db.getAllAsync<Category>('SELECT * FROM categories WHERE deleted = 0 ORDER BY rowid');
}
export async function addCategory(name: string, icon: string, color: string) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO categories (id, name, icon, color, updated_at) VALUES (?, ?, ?, ?, ?)',
    uuid(), name.trim(), icon, color, nowIso()
  );
}
/** Set or clear a category budget. Null clears it; the value is never negative. */
export async function setCategoryBudget(id: string, budget: number | null) {
  const db = await getDb();
  const value = budget === null || !Number.isFinite(budget) ? null : Math.max(0, budget);
  await db.runAsync(
    'UPDATE categories SET monthly_budget = ?, updated_at = ?, dirty = 1 WHERE id = ?',
    value, nowIso(), id
  );
}

/**
 * What each category has cost between two dates, in one grouped query.
 *
 * Expenses only: income lives in its own table and is not spending. Rows
 * generated by a recurring rule are ordinary expenses by the time they are
 * stored, so they count like any other. An expense with line items in other
 * categories still counts in full under the category it was filed in, which
 * is the one the budget was set against.
 */
export async function categorySpendBetween(from: string, to: string) {
  const db = await getDb();
  const rows = await db.getAllAsync<{ category_id: string; total: number }>(
    `SELECT category_id, SUM(amount) AS total FROM expenses
      WHERE deleted = 0 AND date >= ? AND date <= ?
      GROUP BY category_id`,
    from, to
  );
  return new Map(rows.map((row) => [row.category_id, Number(row.total) || 0]));
}
export const CATEGORY_COLORS = ['#C8553D', '#2E7DB8', '#A8831F', '#7159C4', '#2E9465', '#B0479B', '#7B8B1E', '#0D8FAF'];

/** Return the id of the category with this name (case-insensitive), creating it if it doesn't exist. */
export async function findOrCreateCategory(name: string) {
  const db = await getDb();
  const n = name.trim();
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM categories WHERE LOWER(name) = LOWER(?) AND deleted = 0', n
  );
  if (existing) return existing.id;
  const count = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM categories WHERE deleted = 0');
  const color = CATEGORY_COLORS[(count?.c ?? 0) % CATEGORY_COLORS.length];
  const id = uuid();
  await db.runAsync(
    'INSERT INTO categories (id, name, icon, color, updated_at) VALUES (?, ?, ?, ?, ?)',
    id, n, 'pricetag-outline', color, nowIso()
  );
  return id;
}

export async function deleteCategory(id: string) {
  const db = await getDb();
  const other = await db.getFirstAsync<{ id: string }>("SELECT id FROM categories WHERE name = 'Other' AND deleted = 0");
  if (other && other.id !== id) {
    const now = nowIso();
    await db.runAsync('UPDATE expenses SET category_id = ?, updated_at = ?, dirty = 1 WHERE category_id = ?', other.id, now, id);
    await db.runAsync('UPDATE recurring SET category_id = ?, updated_at = ?, dirty = 1 WHERE category_id = ?', other.id, now, id);
    await db.runAsync('UPDATE categories SET deleted = 1, updated_at = ?, dirty = 1 WHERE id = ?', now, id);
  }
}

// ---------- Expenses ----------
const EXPENSE_SELECT = `
  SELECT e.*, c.name AS cat_name, c.icon AS cat_icon, c.color AS cat_color,
    (SELECT COUNT(*) FROM expense_items WHERE expense_id = e.id AND deleted = 0) AS item_count
  FROM expenses e JOIN categories c ON c.id = e.category_id
  WHERE e.deleted = 0`;

export async function listExpenses(from?: string, to?: string) {
  const db = await getDb();
  if (from && to) {
    return db.getAllAsync<ExpenseRow>(
      `${EXPENSE_SELECT} AND e.date >= ? AND e.date <= ? ORDER BY e.date DESC, e.rowid DESC`, from, to
    );
  }
  return db.getAllAsync<ExpenseRow>(`${EXPENSE_SELECT} ORDER BY e.date DESC, e.rowid DESC`);
}

export async function getExpense(id: string) {
  const db = await getDb();
  return db.getFirstAsync<Expense>('SELECT * FROM expenses WHERE id = ?', id);
}

/**
 * Keeps a linked bank account's balance in step with an expense or income
 * entry: reverses what the old amount/account did to it (if any), then
 * applies the new one (if any). Covers every case — account added, removed,
 * swapped, or just the amount changed — with the same two calls.
 *
 * `sign` is the direction money moves for the *new* side: -1 for an expense
 * (it leaves the account), +1 for income (it lands in the account). The
 * reversal of the old side is always the opposite of what it originally did.
 */
async function reconcileAccountBalance(
  before: { account_id: string | null; amount: number } | null,
  after: { account_id: string | null; amount: number },
  sign: 1 | -1
): Promise<void> {
  const { adjustAccountBalance } = await import('./accountsDb');
  if (before?.account_id) await adjustAccountBalance(before.account_id, -sign * before.amount);
  if (after.account_id) await adjustAccountBalance(after.account_id, sign * after.amount);
}

/** Returns the expense id, so the caller can attach line items to a new row. */
export async function saveExpense(e: Omit<Expense, 'id' | 'recurring_id'> & { id?: string }): Promise<string> {
  const db = await getDb();
  const now = nowIso();
  const userTag = (e.user_tag ?? '').trim();
  if (userTag) {
    await findOrCreateTaggedUser(userTag);
  }
  const accountId = e.account_id || null;
  if (e.id) {
    const previous = await getExpense(e.id);
    await db.runAsync(
      'UPDATE expenses SET amount=?, category_id=?, date=?, note=?, notes=?, method=?, user_tag=?, account_id=?, updated_at=?, dirty=1 WHERE id=?',
      e.amount, e.category_id, e.date, e.note, e.notes, e.method, userTag, accountId, now, e.id
    );
    await reconcileAccountBalance(
      previous ? { account_id: previous.account_id ?? null, amount: previous.amount } : null,
      { account_id: accountId, amount: e.amount },
      -1
    );
    return e.id;
  }
  const id = uuid();
  await db.runAsync(
    'INSERT INTO expenses (id, amount, category_id, date, note, notes, method, user_tag, account_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, e.amount, e.category_id, e.date, e.note, e.notes, e.method, userTag, accountId, now
  );
  await reconcileAccountBalance(null, { account_id: accountId, amount: e.amount }, -1);
  return id;
}

export async function listTaggedUsers(): Promise<TaggedUser[]> {
  const db = await getDb();
  return db.getAllAsync<TaggedUser>(
    'SELECT id, name FROM tagged_users WHERE deleted = 0 ORDER BY LOWER(name) ASC'
  );
}

export async function findOrCreateTaggedUser(name: string): Promise<string> {
  const db = await getDb();
  const n = name.trim();
  if (!n) return '';
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM tagged_users WHERE LOWER(name) = LOWER(?) AND deleted = 0', n
  );
  if (existing) return existing.id;
  const id = uuid();
  await db.runAsync(
    'INSERT INTO tagged_users (id, name, updated_at) VALUES (?, ?, ?)',
    id, n, nowIso()
  );
  return id;
}

export async function deleteTaggedUser(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE tagged_users SET deleted = 1, updated_at = ?, dirty = 1 WHERE id = ?', nowIso(), id);
}

export async function deleteExpense(id: string) {
  const db = await getDb();
  const now = nowIso();
  const existing = await getExpense(id);
  if (existing) {
    await reconcileAccountBalance({ account_id: existing.account_id ?? null, amount: existing.amount }, { account_id: null, amount: 0 }, -1);
    // The refund it generated has nothing left to be a refund of.
    if (existing.refund_income_id) await deleteIncome(existing.refund_income_id);
  }
  await db.runAsync('UPDATE expense_items SET deleted = 1, updated_at = ?, dirty = 1 WHERE expense_id = ?', now, id);
  // A link to an expense that no longer exists would keep showing in a trip's
  // total, so it goes the same way — as a tombstone, so the removal travels.
  await db.runAsync(
    'UPDATE memory_expense_links SET deleted = 1, updated_at = ?, dirty = 1 WHERE expense_id = ? AND deleted = 0',
    now, id
  );
  await db.runAsync('UPDATE expenses SET deleted = 1, updated_at = ?, dirty = 1 WHERE id = ?', now, id);
}

/**
 * Sets, changes or clears how much of an expense (e.g. a Ticket) was
 * refunded, and which bank account it landed in. Keeps a single linked
 * Income row ("Refund" category) in step with it — the same row is updated
 * on a later change rather than a new one created each time, so editing the
 * amount or switching banks reconciles through saveIncome's own logic
 * exactly like any other income edit, and clearing it deletes that row via
 * deleteIncome, which reconciles the balance back down on its own.
 */
export async function setExpenseRefund(
  id: string,
  refund: { amount: number; accountId: string | null } | null
): Promise<void> {
  const db = await getDb();
  const expense = await getExpense(id);
  if (!expense) return;
  const now = nowIso();

  if (!refund || refund.amount <= 0) {
    if (expense.refund_income_id) await deleteIncome(expense.refund_income_id);
    await db.runAsync(
      'UPDATE expenses SET cancelled = 0, refund_amount = NULL, refund_account_id = NULL, refund_income_id = NULL, updated_at = ?, dirty = 1 WHERE id = ?',
      now, id
    );
    return;
  }

  const categoryId = await findOrCreateIncomeCategory('Refund');
  const incomeId = await saveIncome({
    id: expense.refund_income_id ?? undefined,
    amount: refund.amount,
    category_id: categoryId,
    date: todayStr(),
    note: expense.note ? `Refund: ${expense.note}` : 'Ticket refund',
    notes: `Refund for ${expense.amount} spent on ${expense.date}`,
    method: refund.accountId ? 'UPI' : 'Cash',
    account_id: refund.accountId,
  });

  await db.runAsync(
    'UPDATE expenses SET cancelled = 1, refund_amount = ?, refund_account_id = ?, refund_income_id = ?, updated_at = ?, dirty = 1 WHERE id = ?',
    refund.amount, refund.accountId, incomeId, now, id
  );
}

// ---------- Links between a PERAI entry and the spending during it ----------

export type LinkedExpenseRow = ExpenseRow & { memory_id: string };

/** The expenses linked to one entry, newest first. */
export async function listLinkedExpenses(memoryId: string) {
  const db = await getDb();
  return db.getAllAsync<ExpenseRow>(
    `${EXPENSE_SELECT} AND e.id IN (
       SELECT expense_id FROM memory_expense_links WHERE memory_id = ? AND deleted = 0
     ) ORDER BY e.date DESC, e.rowid DESC`,
    memoryId
  );
}

/** Every expense id that belongs to some entry, so suggestions can skip them. */
export async function listLinkedExpenseIds(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ expense_id: string }>(
    'SELECT DISTINCT expense_id FROM memory_expense_links WHERE deleted = 0'
  );
  return new Set(rows.map((row) => row.expense_id));
}

/** Entry titles keyed by expense id, for the badge in the history list. */
export async function expenseTripLabels(): Promise<Map<string, string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ expense_id: string; memory_id: string }>(
    'SELECT expense_id, memory_id FROM memory_expense_links WHERE deleted = 0'
  );
  return new Map(rows.map((row) => [row.expense_id, row.memory_id]));
}

/**
 * Link expenses to an entry. Re-linking something already linked simply
 * revives it, because the row's id is derived from the pair.
 */
export async function linkExpenses(memoryId: string, expenseIds: string[]) {
  if (expenseIds.length === 0) return;
  const db = await getDb();
  const now = nowIso();
  for (const expenseId of expenseIds) {
    await db.runAsync(
      `INSERT INTO memory_expense_links (id, memory_id, expense_id, updated_at, dirty, deleted)
       VALUES (?, ?, ?, ?, 1, 0)
       ON CONFLICT(id) DO UPDATE SET deleted = 0, updated_at = excluded.updated_at, dirty = 1`,
      linkId(memoryId, expenseId), memoryId, expenseId, now
    );
  }
}

export async function unlinkExpense(memoryId: string, expenseId: string) {
  const db = await getDb();
  await db.runAsync(
    'UPDATE memory_expense_links SET deleted = 1, updated_at = ?, dirty = 1 WHERE id = ?',
    nowIso(), linkId(memoryId, expenseId)
  );
}

/** Called when a PERAI entry is deleted: its links go with it. */
export async function unlinkAllForMemory(memoryId: string) {
  const db = await getDb();
  await db.runAsync(
    'UPDATE memory_expense_links SET deleted = 1, updated_at = ?, dirty = 1 WHERE memory_id = ? AND deleted = 0',
    nowIso(), memoryId
  );
}

// ---------- Expense items (itemised breakdown of one expense) ----------
export async function listExpenseItems(expenseId: string) {
  const db = await getDb();
  return db.getAllAsync<ExpenseItem>(
    'SELECT * FROM expense_items WHERE expense_id = ? AND deleted = 0 ORDER BY rowid', expenseId
  );
}

/** Replaces the full item list for an expense — simplest correct behaviour for a small, user-edited list. */
export async function saveExpenseItems(expenseId: string, items: { name: string; quantity: number; amount: number }[]) {
  const db = await getDb();
  const now = nowIso();
  await db.runAsync('UPDATE expense_items SET deleted = 1, updated_at = ?, dirty = 1 WHERE expense_id = ? AND deleted = 0', now, expenseId);
  for (const it of items) {
    await db.runAsync(
      'INSERT INTO expense_items (id, expense_id, name, quantity, amount, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      uuid(), expenseId, it.name.trim(), it.quantity, it.amount, now
    );
  }
}

// ---------- Income ----------
export async function listIncomeCategories() {
  const db = await getDb();
  return db.getAllAsync<Category>('SELECT * FROM income_categories WHERE deleted = 0 ORDER BY rowid');
}

/** Return the id of the income category with this name (case-insensitive), creating it if it doesn't exist. */
export async function findOrCreateIncomeCategory(name: string) {
  const db = await getDb();
  const n = name.trim();
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM income_categories WHERE LOWER(name) = LOWER(?) AND deleted = 0', n
  );
  if (existing) return existing.id;
  const count = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM income_categories WHERE deleted = 0');
  const color = CATEGORY_COLORS[(count?.c ?? 0) % CATEGORY_COLORS.length];
  const id = uuid();
  await db.runAsync(
    'INSERT INTO income_categories (id, name, icon, color, updated_at) VALUES (?, ?, ?, ?, ?)',
    id, n, 'pricetag-outline', color, nowIso()
  );
  return id;
}

const INCOME_SELECT = `
  SELECT i.*, c.name AS cat_name, c.icon AS cat_icon, c.color AS cat_color
  FROM income i JOIN income_categories c ON c.id = i.category_id
  WHERE i.deleted = 0`;

export async function listIncome(from?: string, to?: string) {
  const db = await getDb();
  if (from && to) {
    return db.getAllAsync<IncomeRow>(
      `${INCOME_SELECT} AND i.date >= ? AND i.date <= ? ORDER BY i.date DESC, i.rowid DESC`, from, to
    );
  }
  return db.getAllAsync<IncomeRow>(`${INCOME_SELECT} ORDER BY i.date DESC, i.rowid DESC`);
}

export async function getIncome(id: string) {
  const db = await getDb();
  return db.getFirstAsync<Income>('SELECT * FROM income WHERE id = ?', id);
}

export async function saveIncome(e: Omit<Income, 'id'> & { id?: string }): Promise<string> {
  const db = await getDb();
  const now = nowIso();
  const userTag = (e.user_tag ?? '').trim();
  if (userTag) {
    await findOrCreateTaggedUser(userTag);
  }
  const accountId = e.account_id || null;
  if (e.id) {
    const previous = await getIncome(e.id);
    await db.runAsync(
      'UPDATE income SET amount=?, category_id=?, date=?, note=?, notes=?, method=?, user_tag=?, account_id=?, updated_at=?, dirty=1 WHERE id=?',
      e.amount, e.category_id, e.date, e.note, e.notes, e.method, userTag, accountId, now, e.id
    );
    await reconcileAccountBalance(
      previous ? { account_id: previous.account_id ?? null, amount: previous.amount } : null,
      { account_id: accountId, amount: e.amount },
      1
    );
    return e.id;
  }
  const id = uuid();
  await db.runAsync(
    'INSERT INTO income (id, amount, category_id, date, note, notes, method, user_tag, account_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, e.amount, e.category_id, e.date, e.note, e.notes, e.method, userTag, accountId, now
  );
  await reconcileAccountBalance(null, { account_id: accountId, amount: e.amount }, 1);
  return id;
}

export async function deleteIncome(id: string) {
  const db = await getDb();
  const existing = await getIncome(id);
  if (existing) await reconcileAccountBalance({ account_id: existing.account_id ?? null, amount: existing.amount }, { account_id: null, amount: 0 }, 1);
  await db.runAsync('UPDATE income SET deleted = 1, updated_at = ?, dirty = 1 WHERE id = ?', nowIso(), id);
}

// ---------- Recurring ----------
export async function listRecurring() {
  const db = await getDb();
  return db.getAllAsync<Recurring>(
    `SELECT r.*, c.name AS cat_name FROM recurring r JOIN categories c ON c.id = r.category_id
     WHERE r.deleted = 0 ORDER BY r.day`
  );
}
export async function addRecurring(r: Omit<Recurring, 'id' | 'last_ym' | 'cat_name'>) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO recurring (id, amount, category_id, note, method, day, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    uuid(), r.amount, r.category_id, r.note, r.method, r.day, nowIso()
  );
  await generateRecurring(db);
}
export async function deleteRecurring(id: string) {
  const db = await getDb();
  await db.runAsync('UPDATE recurring SET deleted = 1, updated_at = ?, dirty = 1 WHERE id = ?', nowIso(), id);
}

// ---------- Settings ----------
export async function getSetting(key: string, fallback = '') {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : fallback;
}
export async function setSetting(key: string, value: string) {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
}
