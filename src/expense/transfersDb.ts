import type * as SQLite from 'expo-sqlite';
import { getDb, uuid } from './db';
import { adjustAccountBalance, listAccounts, saveAccount } from './accountsDb';
import { transferDeltas, type Transfer } from './transferLogic';

export type { Transfer } from './transferLogic';

/** Kept on this phone only, like the accounts it moves money between. */
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS transfers (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    from_account_id TEXT NOT NULL,
    to_account_id TEXT NOT NULL,
    amount REAL NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_transfers_date ON transfers(date);
`;

async function ready(): Promise<SQLite.SQLiteDatabase> {
  const db = await getDb();
  await db.execAsync(SCHEMA_SQL);
  return db;
}

export async function listTransfers(): Promise<Transfer[]> {
  const db = await ready();
  return db.getAllAsync<Transfer>('SELECT * FROM transfers ORDER BY date DESC, created_at DESC');
}

/** The wallet cash goes into when none is picked: the first cash account, made on the spot if there is none. */
async function defaultCashAccountId(): Promise<string> {
  const existing = (await listAccounts({ type: 'cash' }))[0];
  if (existing) return existing.id;
  return saveAccount({ name: 'Cash in hand', type: 'cash', balance: 0, currency: '₹', notes: '', institution: '' });
}

/**
 * Cash taken out at an ATM: the bank balance drops by the amount and the cash
 * wallet rises by it, so the total you own does not change. Returns the id.
 */
export async function saveAtmWithdrawal(input: {
  fromAccountId: string;
  toAccountId?: string | null;
  amount: number;
  date: string;
  note?: string;
}): Promise<string> {
  const db = await ready();
  const toAccountId = input.toAccountId || (await defaultCashAccountId());
  const amount = Math.round(input.amount * 100) / 100;
  const id = uuid();
  await db.runAsync(
    'INSERT INTO transfers (id, date, from_account_id, to_account_id, amount, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, input.date, input.fromAccountId, toAccountId, amount, (input.note || '').trim(), new Date().toISOString()
  );
  const d = transferDeltas(amount);
  await adjustAccountBalance(input.fromAccountId, d.from);
  await adjustAccountBalance(toAccountId, d.to);
  return id;
}

/** Remove a withdrawal and put both balances back. */
export async function deleteTransfer(id: string): Promise<void> {
  const db = await ready();
  const t = await db.getFirstAsync<Transfer>('SELECT * FROM transfers WHERE id = ?', id);
  if (!t) return;
  await db.runAsync('DELETE FROM transfers WHERE id = ?', id);
  const d = transferDeltas(t.amount);
  await adjustAccountBalance(t.from_account_id, -d.from);
  await adjustAccountBalance(t.to_account_id, -d.to);
}
