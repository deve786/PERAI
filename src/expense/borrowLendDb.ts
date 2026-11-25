import * as SQLite from 'expo-sqlite';
import {
  getDb, uuid, findOrCreateTaggedUser, saveIncome, findOrCreateIncomeCategory,
  saveExpense, findOrCreateCategory,
} from './db';
import { todayStr } from './dates';
import { loanBalanceDelta, outstandingOf, planRepayment } from './loanLogic';

export { loanBalanceDelta } from './loanLogic';

export type BorrowLendType = 'lent' | 'borrowed' | 'request';
export type BorrowLendStatus = 'active' | 'settled' | 'declined';

export interface BorrowLendItem {
  id: string;
  person_name: string;
  type: BorrowLendType;
  amount: number;
  date: string; // YYYY-MM-DD
  due_date: string | null; // YYYY-MM-DD
  notes: string;
  status: BorrowLendStatus;
  settled_amount: number;
  settled_at: string | null;
  /** What was actually handed back so far, which need not equal what was lent. Absent on older loans. */
  returned_amount?: number;
  /** How the money moved when the loan was made: Cash, UPI, Card or Bank. Empty on older loans. */
  method?: string;
  /** The bank or cash account it left from (lent) or arrived in (borrowed). Null when not tracked. */
  account_id?: string | null;
  updated_at: string;
  dirty: number;
  deleted: number;
}

export interface BorrowLendSummary {
  totalLentActive: number;
  totalBorrowedActive: number;
  pendingRequestsCount: number;
  pendingRequestsAmount: number;
}

const nowIso = () => new Date().toISOString();

export const BORROW_LEND_SCHEMA_SQL = `
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
`;

let columnsChecked = false;

export async function initBorrowLendTable(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(BORROW_LEND_SCHEMA_SQL);
  if (columnsChecked) return;
  // Loans made before the payment choice existed have neither column.
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(borrow_lend)');
  const has = (name: string) => columns.some((c) => c.name === name);
  if (!has('method')) await db.execAsync("ALTER TABLE borrow_lend ADD COLUMN method TEXT NOT NULL DEFAULT ''");
  if (!has('returned_amount')) await db.execAsync('ALTER TABLE borrow_lend ADD COLUMN returned_amount REAL NOT NULL DEFAULT 0');
  if (!has('account_id')) await db.execAsync('ALTER TABLE borrow_lend ADD COLUMN account_id TEXT');
  columnsChecked = true;
}

/** Applies `delta` to an account, if there is one. Loaded on demand: accountsDb itself imports this file. */
async function moveBalance(accountId: string | null | undefined, delta: number): Promise<void> {
  if (!accountId || !delta) return;
  const { adjustAccountBalance } = await import('./accountsDb');
  await adjustAccountBalance(accountId, delta);
}

export async function listBorrowLend(filter?: {
  status?: BorrowLendStatus;
  type?: BorrowLendType;
}): Promise<BorrowLendItem[]> {
  const db = await getDb();
  await initBorrowLendTable(db);

  let query = 'SELECT * FROM borrow_lend WHERE deleted = 0';
  const params: unknown[] = [];

  if (filter?.status) {
    query += ' AND status = ?';
    params.push(filter.status);
  }
  if (filter?.type) {
    query += ' AND type = ?';
    params.push(filter.type);
  }

  query += " ORDER BY CASE WHEN status = 'active' THEN 0 WHEN status = 'request' THEN 1 ELSE 2 END, date DESC";
  return db.getAllAsync<BorrowLendItem>(query, ...(params as SQLite.SQLiteBindValue[]));
}

export async function getBorrowLendItem(id: string): Promise<BorrowLendItem | null> {
  const db = await getDb();
  await initBorrowLendTable(db);
  return db.getFirstAsync<BorrowLendItem>(
    'SELECT * FROM borrow_lend WHERE id = ? AND deleted = 0',
    id
  );
}

export async function saveBorrowLend(
  item: Omit<BorrowLendItem, 'id' | 'updated_at' | 'dirty' | 'deleted'> & { id?: string }
): Promise<string> {
  const db = await getDb();
  await initBorrowLendTable(db);

  const now = nowIso();
  const person = item.person_name.trim();
  if (person) {
    await findOrCreateTaggedUser(person).catch(() => {});
  }

  const method = item.method ?? '';
  const accountId = item.account_id || null;

  if (item.id) {
    const previous = await getBorrowLendItem(item.id);
    await db.runAsync(
      `UPDATE borrow_lend SET
        person_name = ?,
        type = ?,
        amount = ?,
        date = ?,
        due_date = ?,
        notes = ?,
        status = ?,
        settled_amount = ?,
        settled_at = ?,
        method = ?,
        account_id = ?,
        updated_at = ?,
        dirty = 1
      WHERE id = ?`,
      person,
      item.type,
      item.amount,
      item.date,
      item.due_date ?? null,
      item.notes ?? '',
      item.status,
      item.settled_amount ?? 0,
      item.settled_at ?? null,
      method,
      accountId,
      now,
      item.id
    );
    // Undo what the loan did before, then do what it does now — so changing
    // the amount, the bank or the type leaves every balance right.
    if (previous) await moveBalance(previous.account_id, -loanBalanceDelta(previous.type, previous.amount));
    await moveBalance(accountId, loanBalanceDelta(item.type, item.amount));
    return item.id;
  }

  const id = uuid();
  await db.runAsync(
    `INSERT INTO borrow_lend (
      id, person_name, type, amount, date, due_date, notes, status, settled_amount, settled_at, method, account_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    person,
    item.type,
    item.amount,
    item.date,
    item.due_date ?? null,
    item.notes ?? '',
    item.status,
    item.settled_amount ?? 0,
    item.settled_at ?? null,
    method,
    accountId,
    now
  );
  await moveBalance(accountId, loanBalanceDelta(item.type, item.amount));
  return id;
}

export async function settleBorrowLend(
  id: string,
  options: {
    /**
     * What was actually handed back this time. Defaults to everything still
     * owed. It can be more (interest) or less (a part payment) than that.
     */
    returnedAmount?: number;
    /** Returned less than is owed, and the rest is let go: the loan closes anyway. */
    writeOffRest?: boolean;
    /** 'lent' settling, i.e. you were repaid: record it as income. */
    recordAsIncome?: boolean;
    /** 'borrowed' settling, i.e. you paid it back: record it as an expense. */
    recordAsExpense?: boolean;
    /** Payment method for the record above. Defaults to UPI. */
    method?: string;
    /** The bank account the money landed in (lent) or left from (borrowed), if any. */
    accountId?: string | null;
  } = {}
): Promise<void> {
  const db = await getDb();
  await initBorrowLendTable(db);

  const item = await getBorrowLendItem(id);
  if (!item) return;

  const now = nowIso();
  const returned = options.returnedAmount ?? outstandingOf(item.amount, item.settled_amount);
  const plan = planRepayment({
    amount: item.amount,
    settled: item.settled_amount,
    returned,
    writeOffRest: options.writeOffRest,
  });

  await db.runAsync(
    `UPDATE borrow_lend SET
      settled_amount = ?,
      returned_amount = COALESCE(returned_amount, 0) + ?,
      status = ?,
      settled_at = ?,
      updated_at = ?,
      dirty = 1
    WHERE id = ?`,
    plan.settledAmount,
    returned,
    plan.closed ? 'settled' : 'active',
    plan.closed ? now : item.settled_at,
    now,
    id
  );

  const detail = [
    `Repayment for ${item.amount} ${item.type === 'lent' ? 'lent' : 'borrowed'} on ${item.date}`,
    plan.extra > 0 ? `${plan.extra} more than the loan` : '',
    plan.shortfall > 0 ? `${plan.shortfall} let go` : '',
    !plan.closed ? `${plan.remaining} still to come` : '',
  ].filter(Boolean).join(' · ');

  // If this was money lent to someone and they paid it back: it lands back
  // in the chosen bank account, so it's recorded as income — the amount that
  // actually arrived, which may differ from what was lent.
  if (item.type === 'lent' && options.recordAsIncome && returned > 0) {
    const categoryId = await findOrCreateIncomeCategory('Refund');
    await saveIncome({
      amount: returned,
      category_id: categoryId,
      date: todayStr(),
      note: `Loan repayment: ${item.person_name}`,
      notes: detail,
      method: options.method ?? 'UPI',
      account_id: options.accountId ?? null,
    });
  }

  // If this was money you borrowed and you paid it back: it leaves the
  // chosen bank account, so it's recorded as an expense, the same as any
  // other spend — it shows up in history and deducts from the account.
  if (item.type === 'borrowed' && options.recordAsExpense && returned > 0) {
    const categoryId = await findOrCreateCategory('Debt Repayment');
    await saveExpense({
      amount: returned,
      category_id: categoryId,
      date: todayStr(),
      note: `Loan repayment: ${item.person_name}`,
      notes: detail,
      method: options.method ?? 'UPI',
      account_id: options.accountId ?? null,
      user_tag: '',
    });
  }
}

export async function deleteBorrowLend(id: string): Promise<void> {
  const db = await getDb();
  await initBorrowLendTable(db);
  // What was already paid back was recorded as its own income or expense, so
  // only the part still outstanding is taken back out of the account.
  const item = await getBorrowLendItem(id);
  if (item?.account_id) {
    const outstanding = outstandingOf(item.amount, item.settled_amount);
    await moveBalance(item.account_id, -loanBalanceDelta(item.type, outstanding));
  }
  await db.runAsync(
    'UPDATE borrow_lend SET deleted = 1, updated_at = ?, dirty = 1 WHERE id = ?',
    nowIso(),
    id
  );
}

export async function getBorrowLendSummary(): Promise<BorrowLendSummary> {
  const items = await listBorrowLend();
  let totalLentActive = 0;
  let totalBorrowedActive = 0;
  let pendingRequestsCount = 0;
  let pendingRequestsAmount = 0;

  for (const it of items) {
    if (it.status === 'active') {
      const remaining = Math.max(0, it.amount - (it.settled_amount || 0));
      if (it.type === 'lent') {
        totalLentActive += remaining;
      } else if (it.type === 'borrowed') {
        totalBorrowedActive += remaining;
      } else if (it.type === 'request') {
        pendingRequestsCount += 1;
        pendingRequestsAmount += it.amount;
      }
    }
  }

  return {
    totalLentActive: Math.round(totalLentActive * 100) / 100,
    totalBorrowedActive: Math.round(totalBorrowedActive * 100) / 100,
    pendingRequestsCount,
    pendingRequestsAmount: Math.round(pendingRequestsAmount * 100) / 100,
  };
}
