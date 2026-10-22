import * as SQLite from 'expo-sqlite';
import { getDb, uuid } from './db';
import { getBorrowLendSummary } from './borrowLendDb';

export {
  type AccountType,
  type AccountItem,
  type NetWorthSummary,
  computeNetWorth,
} from './accountsLogic';
import { type AccountType, type AccountItem, type NetWorthSummary, computeNetWorth } from './accountsLogic';

const nowIso = () => new Date().toISOString();

export const ACCOUNTS_SCHEMA_SQL = `
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

export async function initAccountsTable(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(ACCOUNTS_SCHEMA_SQL);
}

export async function listAccounts(filter?: { type?: AccountType }): Promise<AccountItem[]> {
  const db = await getDb();
  await initAccountsTable(db);

  let query = 'SELECT * FROM accounts WHERE deleted = 0';
  const params: unknown[] = [];

  if (filter?.type) {
    query += ' AND type = ?';
    params.push(filter.type);
  }

  query += " ORDER BY CASE type WHEN 'bank' THEN 0 WHEN 'cash' THEN 1 WHEN 'stock' THEN 2 WHEN 'crypto' THEN 3 ELSE 4 END, balance DESC";
  return db.getAllAsync<AccountItem>(query, ...(params as SQLite.SQLiteBindValue[]));
}

export async function getAccount(id: string): Promise<AccountItem | null> {
  const db = await getDb();
  await initAccountsTable(db);
  return db.getFirstAsync<AccountItem>('SELECT * FROM accounts WHERE id = ? AND deleted = 0', id);
}

export async function saveAccount(
  account: Omit<AccountItem, 'id' | 'updated_at' | 'dirty' | 'deleted'> & { id?: string }
): Promise<string> {
  const db = await getDb();
  await initAccountsTable(db);

  const now = nowIso();
  const id = account.id || uuid();

  await db.runAsync(
    `INSERT INTO accounts (id, name, type, balance, currency, notes, institution, invested, pay_method, pay_account_id, updated_at, dirty, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       type = excluded.type,
       balance = excluded.balance,
       currency = excluded.currency,
       notes = excluded.notes,
       institution = excluded.institution,
       invested = excluded.invested,
       pay_method = excluded.pay_method,
       pay_account_id = excluded.pay_account_id,
       updated_at = excluded.updated_at,
       dirty = 1,
       deleted = 0`,
    id,
    account.name.trim(),
    account.type,
    account.balance || 0,
    account.currency || '₹',
    (account.notes || '').trim(),
    (account.institution || '').trim(),
    account.invested ?? null,
    account.pay_method || '',
    account.pay_account_id || null,
    now
  );

  return id;
}

export async function updateAccountBalance(id: string, balance: number): Promise<void> {
  const db = await getDb();
  await initAccountsTable(db);
  const now = nowIso();
  await db.runAsync(
    'UPDATE accounts SET balance = ?, updated_at = ?, dirty = 1 WHERE id = ?',
    balance,
    now,
    id
  );
}

/**
 * Adds `delta` to an account's balance (negative to deduct) — an in-place
 * `balance = balance + ?` rather than read-then-write, so two expenses saved
 * in quick succession can't race and clobber each other's deduction.
 */
export async function adjustAccountBalance(id: string, delta: number): Promise<void> {
  if (!id || !delta) return;
  const db = await getDb();
  await initAccountsTable(db);
  await db.runAsync(
    'UPDATE accounts SET balance = balance + ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted = 0',
    delta,
    nowIso(),
    id
  );
}

export async function deleteAccount(id: string): Promise<void> {
  const db = await getDb();
  await initAccountsTable(db);
  const now = nowIso();
  await db.runAsync(
    'UPDATE accounts SET deleted = 1, updated_at = ?, dirty = 1 WHERE id = ?',
    now,
    id
  );
}

export async function getNetWorthSummary(): Promise<NetWorthSummary> {
  const [accounts, blSummary] = await Promise.all([
    listAccounts(),
    getBorrowLendSummary().catch(() => ({
      totalLentActive: 0,
      totalBorrowedActive: 0,
      pendingRequestsCount: 0,
      pendingRequestsAmount: 0,
    })),
  ]);

  return computeNetWorth(accounts, blSummary);
}
