import * as SQLite from 'expo-sqlite';
import { getDb, uuid, findOrCreateTaggedUser, saveIncome, findOrCreateIncomeCategory } from './db';
import { todayStr } from './dates';

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

export async function initBorrowLendTable(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(BORROW_LEND_SCHEMA_SQL);
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

  query += ' ORDER BY CASE WHEN status = "active" THEN 0 WHEN status = "request" THEN 1 ELSE 2 END, date DESC';
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

  if (item.id) {
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
      now,
      item.id
    );
    return item.id;
  }

  const id = uuid();
  await db.runAsync(
    `INSERT INTO borrow_lend (
      id, person_name, type, amount, date, due_date, notes, status, settled_amount, settled_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    now
  );
  return id;
}

export async function settleBorrowLend(
  id: string,
  options: {
    settleAmount?: number;
    recordAsIncome?: boolean;
    incomeMethod?: string;
  } = {}
): Promise<void> {
  const db = await getDb();
  await initBorrowLendTable(db);

  const item = await getBorrowLendItem(id);
  if (!item) return;

  const now = nowIso();
  const amountToSettle = options.settleAmount ?? item.amount;
  const isFullySettled = amountToSettle >= item.amount;

  await db.runAsync(
    `UPDATE borrow_lend SET
      settled_amount = ?,
      status = ?,
      settled_at = ?,
      updated_at = ?,
      dirty = 1
    WHERE id = ?`,
    amountToSettle,
    isFullySettled ? 'settled' : 'active',
    isFullySettled ? now : item.settled_at,
    now,
    id
  );

  // If this was money lent to someone and user opted to record it as income:
  if (item.type === 'lent' && options.recordAsIncome) {
    const categoryId = await findOrCreateIncomeCategory('Refund');
    await saveIncome({
      amount: amountToSettle,
      category_id: categoryId,
      date: todayStr(),
      note: `Loan repayment: ${item.person_name}`,
      notes: `Repayment for ${item.amount} lent on ${item.date}`,
      method: options.incomeMethod ?? 'UPI',
    });
  }
}

export async function deleteBorrowLend(id: string): Promise<void> {
  const db = await getDb();
  await initBorrowLendTable(db);
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
