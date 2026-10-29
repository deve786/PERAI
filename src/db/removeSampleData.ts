/**
 * Take out exactly what "Load Sample Data" put in, and nothing else.
 *
 * The sample data was written with no marker on it, straight into the same
 * tables as real entries, by a button that did its work on a single tap. So
 * this cannot simply delete "the sample rows" — it has to recognise each one.
 *
 * Everything the seeder wrote is known exactly: the accounts, bills,
 * documents and Telegram channel carry fixed ids, and every expense, income,
 * loan and entry carries a fixed piece of text written for it. A row is only
 * taken when it matches one of those in full — its text AND its amount, or
 * its fixed id AND its name — so an entry of your own that happens to share a
 * word, or even a whole title, with a sample one is left alone.
 *
 * Removal is a real delete, not a hide. The app's own delete calls run first,
 * so account balances and links are tidied the same way as for any other
 * delete; then the sample rows are physically removed from this phone — along
 * with any that an earlier removal only hid — and their copies in the cloud
 * backup are deleted too, or the next sync would bring them back. If a cloud
 * copy cannot be deleted right now (offline, signed out) its rows stay hidden
 * instead, so the removal still reaches the backup later.
 */
import { deleteMemories } from './queries';
import { getDb as getPeraiDb } from './client';
import { deleteExpense, deleteIncome, deleteRecurring, deleteTaggedPlace, deleteTaggedUser, getDb as getExpenseDb, setSetting } from '../expense/db';
import * as expenseCloud from '../expense/sync/client';
import * as peraiCloud from '../sync/client';
import { SAMPLE_HANDLED_KEY } from './seedData';
import { deleteAccount } from '../expense/accountsDb';
import { deleteBorrowLend } from '../expense/borrowLendDb';
import { deleteDocument } from '../sources/documents';
import { deleteWebsite } from '../sources/websites';
import { getSourcesDb } from '../sources/client';
import { currentUserId, getSupabase, isConfigured } from '../sync/client';
import {
  SAMPLE_ACCOUNTS,
  SAMPLE_BUDGETS,
  SAMPLE_DOCUMENTS,
  SAMPLE_EXPENSES,
  SAMPLE_INCOME,
  SAMPLE_LOANS,
  SAMPLE_MEMORIES,
  SAMPLE_PEOPLE,
  SAMPLE_PLACES,
  SAMPLE_RECURRING,
  SAMPLE_TELEGRAM_CHANNEL,
  SAMPLE_TELEGRAM_MESSAGE_ID,
  SAMPLE_WEBSITE,
} from './sampleDataFingerprint';

export interface SampleDataFound {
  memoryIds: string[];
  expenseIds: string[];
  incomeIds: string[];
  loanIds: string[];
  accountIds: string[];
  recurringIds: string[];
  budgetCategoryIds: string[];
  /** Saved places / people chips the sample data left behind and nothing else uses. */
  placeIds: string[];
  personIds: string[];
  documentIds: string[];
  websiteIds: string[];
  telegramChannelIds: string[];
  telegramMessageIds: string[];
  /** Sample rows an earlier removal only hid (marked deleted) that are still stored on this phone. */
  hiddenCount: number;
}

/** How many rows were found, by kind — for the confirmation the person reads first. */
export function describeSampleData(found: SampleDataFound): { label: string; count: number }[] {
  const lines = [
    { label: 'notes and tasks', count: found.memoryIds.length },
    { label: 'expenses', count: found.expenseIds.length },
    { label: 'income entries', count: found.incomeIds.length },
    { label: 'borrow and lend records', count: found.loanIds.length },
    { label: 'accounts', count: found.accountIds.length },
    { label: 'recurring bills', count: found.recurringIds.length },
    { label: 'category budgets', count: found.budgetCategoryIds.length },
    { label: 'saved places', count: found.placeIds.length },
    { label: 'saved people', count: found.personIds.length },
    { label: 'sample items hidden by an earlier removal, still stored', count: found.hiddenCount },
    { label: 'documents', count: found.documentIds.length },
    { label: 'websites', count: found.websiteIds.length },
    {
      label: 'Telegram channels and messages',
      count: found.telegramChannelIds.length + found.telegramMessageIds.length,
    },
  ];
  return lines.filter((line) => line.count > 0);
}

export function sampleDataTotal(found: SampleDataFound): number {
  return describeSampleData(found).reduce((sum, line) => sum + line.count, 0);
}

/** Amounts are stored as REAL; compare them with a cent of slack. */
const AMOUNT_SLACK = 0.005;

/**
 * Saved chips (places or people) named in `names` that nothing but the sample
 * rows being removed still refers to: not an expense or income of yours with
 * that place or person, and not a loan of yours with that person.
 */
async function unusedChips(
  includeDeleted: boolean,
  table: 'tagged_places' | 'tagged_users',
  names: string[],
  column: 'place' | 'user_tag',
  sampleExpenseIds: string[],
  sampleIncomeIds: string[],
  sampleLoanIds: string[]
): Promise<string[]> {
  const expense = await getExpenseDb();
  const except = (ids: string[]) => (ids.length > 0 ? ` AND id NOT IN (${ids.map(() => '?').join(',')})` : '');
  const count = async (sql: string, ...params: (string | number)[]) => {
    try {
      const row = await expense.getFirstAsync<{ c: number }>(sql, ...params);
      return row?.c ?? 0;
    } catch {
      return 0;
    }
  };

  const out: string[] = [];
  for (const name of names) {
    const chip = await expense
      .getFirstAsync<{ id: string }>(`SELECT id FROM ${table} WHERE ${includeDeleted ? '1 = 1' : 'deleted = 0'} AND LOWER(name) = LOWER(?)`, name)
      .catch(() => null);
    if (!chip) continue;
    const usedBy =
      (await count(
        `SELECT COUNT(*) AS c FROM expenses WHERE deleted = 0 AND LOWER(${column}) = LOWER(?)${except(sampleExpenseIds)}`,
        name, ...sampleExpenseIds
      )) +
      (await count(
        `SELECT COUNT(*) AS c FROM income WHERE deleted = 0 AND LOWER(${column}) = LOWER(?)${except(sampleIncomeIds)}`,
        name, ...sampleIncomeIds
      )) +
      (column === 'user_tag'
        ? await count(
            `SELECT COUNT(*) AS c FROM borrow_lend WHERE deleted = 0 AND LOWER(person_name) = LOWER(?)${except(sampleLoanIds)}`,
            name, ...sampleLoanIds
          )
        : 0);
    if (usedBy === 0) out.push(chip.id);
  }
  return out;
}

/** Rows found, not counting `hiddenCount`. */
function rowTotal(found: SampleDataFound): number {
  return (
    found.memoryIds.length + found.expenseIds.length + found.incomeIds.length + found.loanIds.length +
    found.accountIds.length + found.recurringIds.length + found.budgetCategoryIds.length +
    found.placeIds.length + found.personIds.length + found.documentIds.length + found.websiteIds.length +
    found.telegramChannelIds.length + found.telegramMessageIds.length
  );
}

/** Look, without changing anything. Rows already hidden by an earlier removal are counted separately. */
export async function findSampleData(): Promise<SampleDataFound> {
  const live = await collect(false);
  const all = await collect(true);
  return { ...live, hiddenCount: Math.max(0, rowTotal(all) - rowTotal(live)) };
}

/** The matching itself. With `includeDeleted` it also matches rows an older removal marked deleted. */
async function collect(includeDeleted: boolean): Promise<SampleDataFound> {
  const W = includeDeleted ? '1 = 1' : 'deleted = 0';
  const perai = getPeraiDb();
  const expense = await getExpenseDb();
  const sources = await getSourcesDb();

  const memoryIds: string[] = [];
  for (const sample of SAMPLE_MEMORIES) {
    const rows = await perai.getAllAsync<{ id: string }>(
      `SELECT id FROM memories WHERE ${W} AND title = ? AND raw_input = ?`,
      [sample.title, sample.rawInput]
    );
    memoryIds.push(...rows.map((row) => row.id));
  }

  const expenseIds: string[] = [];
  for (const sample of SAMPLE_EXPENSES) {
    const rows = await expense.getAllAsync<{ id: string }>(
      `SELECT id FROM expenses WHERE ${W} AND note = ? AND notes = ? AND ABS(amount - ?) < ?`,
      sample.note, sample.notes, sample.amount, AMOUNT_SLACK
    );
    expenseIds.push(...rows.map((row) => row.id));
  }

  const recurringIds: string[] = [];
  for (const sample of SAMPLE_RECURRING) {
    const row = await expense.getFirstAsync<{ id: string }>(
      `SELECT id FROM recurring WHERE ${W} AND id = ? AND note = ?`,
      sample.id, sample.note
    );
    if (row) recurringIds.push(row.id);
  }

  // A sample bill that already came due made an expense of its own; it goes too.
  if (recurringIds.length > 0) {
    const placeholders = recurringIds.map(() => '?').join(',');
    const generated = await expense
      .getAllAsync<{ id: string }>(
        `SELECT id FROM expenses WHERE ${W} AND recurring_id IN (${placeholders})`,
        ...recurringIds
      )
      .catch(() => [] as { id: string }[]);
    for (const row of generated) if (!expenseIds.includes(row.id)) expenseIds.push(row.id);
  }

  const incomeIds: string[] = [];
  for (const sample of SAMPLE_INCOME) {
    const rows = await expense.getAllAsync<{ id: string }>(
      `SELECT id FROM income WHERE ${W} AND note = ? AND notes = ? AND ABS(amount - ?) < ?`,
      sample.note, sample.notes, sample.amount, AMOUNT_SLACK
    );
    incomeIds.push(...rows.map((row) => row.id));
  }

  const loanIds: string[] = [];
  for (const sample of SAMPLE_LOANS) {
    const rows = await expense
      .getAllAsync<{ id: string }>(
        `SELECT id FROM borrow_lend WHERE ${W} AND person_name = ? AND notes = ? AND ABS(amount - ?) < ?`,
        sample.person, sample.notes, sample.amount, AMOUNT_SLACK
      )
      .catch(() => [] as { id: string }[]);
    loanIds.push(...rows.map((row) => row.id));
  }

  const accountIds: string[] = [];
  for (const sample of SAMPLE_ACCOUNTS) {
    const row = await expense
      .getFirstAsync<{ id: string }>(
        `SELECT id FROM accounts WHERE ${W} AND id = ? AND name = ?`,
        sample.id, sample.name
      )
      .catch(() => null);
    if (row) accountIds.push(row.id);
  }

  const budgetCategoryIds: string[] = [];
  for (const sample of SAMPLE_BUDGETS) {
    const row = await expense.getFirstAsync<{ id: string }>(
      `SELECT id FROM categories WHERE ${W} AND name = ? AND ABS(monthly_budget - ?) < ?`,
      sample.category, sample.amount, AMOUNT_SLACK
    );
    if (row) budgetCategoryIds.push(row.id);
  }

  // The places and people the sample data saved as chips. They stay on the
  // forms after the sample expenses are gone, so they go too — but only a
  // name that no remaining entry of yours uses.
  const placeIds = await unusedChips(includeDeleted, 'tagged_places', SAMPLE_PLACES, 'place', expenseIds, incomeIds, loanIds);
  const personIds = await unusedChips(includeDeleted, 'tagged_users', SAMPLE_PEOPLE, 'user_tag', expenseIds, incomeIds, loanIds);

  const documentIds: string[] = [];
  for (const sample of SAMPLE_DOCUMENTS) {
    const row = await sources.getFirstAsync<{ id: string }>(
      'SELECT id FROM documents WHERE id = ? AND filename = ?',
      [sample.id, sample.filename]
    );
    if (row) documentIds.push(row.id);
  }

  const websiteIds: string[] = [];
  const website = await sources.getFirstAsync<{ id: string }>(
    'SELECT id FROM website_data WHERE id = ? AND url = ?',
    [SAMPLE_WEBSITE.id, SAMPLE_WEBSITE.url]
  );
  if (website) websiteIds.push(website.id);

  const telegramChannelIds: string[] = [];
  const channel = await sources.getFirstAsync<{ id: string }>(
    'SELECT id FROM telegram_channels WHERE id = ? AND channel_username = ?',
    [SAMPLE_TELEGRAM_CHANNEL.id, SAMPLE_TELEGRAM_CHANNEL.username]
  );
  if (channel) telegramChannelIds.push(channel.id);

  // Only the one message the seeder wrote, and anything filed under the
  // sample channel's own id. A real channel of the same name has its own id
  // and keeps its messages.
  const messages = await sources.getAllAsync<{ id: string }>(
    'SELECT id FROM telegram_messages WHERE id = ? OR channel_id = ?',
    [SAMPLE_TELEGRAM_MESSAGE_ID, SAMPLE_TELEGRAM_CHANNEL.id]
  );
  const telegramMessageIds = messages.map((row) => row.id);

  return {
    memoryIds,
    expenseIds,
    incomeIds,
    loanIds,
    accountIds,
    recurringIds,
    budgetCategoryIds,
    placeIds,
    personIds,
    documentIds,
    websiteIds,
    telegramChannelIds,
    telegramMessageIds,
    hiddenCount: 0,
  };
}

/**
 * Remove what findSampleData found. Each kind is tried on its own, so one
 * failure does not leave the rest behind; the count of what could not be
 * removed comes back so the screen can say so.
 */
export async function removeSampleData(found: SampleDataFound): Promise<{ removed: number; failed: number }> {
  let removed = 0;
  let failed = 0;
  // From now on the app never loads sample data by itself, even on an empty phone.
  await setSetting(SAMPLE_HANDLED_KEY, '1').catch(() => {});
  const attempt = async (work: () => Promise<unknown>) => {
    try {
      await work();
      removed += 1;
    } catch (err) {
      failed += 1;
      console.warn('Could not remove a sample row:', err);
    }
  };

  // Expenses and income before the accounts they moved, so their balance
  // adjustments land on accounts that still exist.
  for (const id of found.expenseIds) await attempt(() => deleteExpense(id));
  for (const id of found.incomeIds) await attempt(() => deleteIncome(id));
  for (const id of found.recurringIds) await attempt(() => deleteRecurring(id));
  for (const id of found.loanIds) await attempt(() => deleteBorrowLend(id));
  for (const id of found.accountIds) await attempt(() => deleteAccount(id));
  for (const id of found.placeIds) await attempt(() => deleteTaggedPlace(id));
  for (const id of found.personIds) await attempt(() => deleteTaggedUser(id));

  if (found.budgetCategoryIds.length > 0) {
    const expense = await getExpenseDb();
    const now = new Date().toISOString();
    for (const id of found.budgetCategoryIds) {
      await attempt(() =>
        expense.runAsync(
          'UPDATE categories SET monthly_budget = NULL, updated_at = ?, dirty = 1 WHERE id = ?',
          now, id
        )
      );
    }
  }

  if (found.memoryIds.length > 0) {
    try {
      await deleteMemories(found.memoryIds);
      removed += found.memoryIds.length;
    } catch (err) {
      failed += found.memoryIds.length;
      console.warn('Could not remove sample entries:', err);
    }
  }

  for (const id of found.documentIds) await attempt(() => deleteDocument(id));
  for (const id of found.websiteIds) await attempt(() => deleteWebsite(id));

  if (found.telegramMessageIds.length > 0 || found.telegramChannelIds.length > 0) {
    const sources = await getSourcesDb();
    for (const id of found.telegramMessageIds) {
      await attempt(() => sources.runAsync('DELETE FROM telegram_messages WHERE id = ?', [id]));
    }
    for (const id of found.telegramChannelIds) {
      await attempt(async () => {
        await sources.runAsync('DELETE FROM telegram_channels WHERE id = ?', [id]);
        if (isConfigured()) {
          const userId = await currentUserId();
          if (userId) {
            await getSupabase().from('telegram_channels').delete().eq('id', id).eq('user_id', userId);
          }
        }
      });
    }
  }

  // Everything above only marked rows deleted. Now remove them for real,
  // together with any an earlier removal left hidden.
  try {
    const purge = await purgeForGood(await collect(true));
    failed += purge.failed;
    removed += found.hiddenCount;
  } catch (err) {
    failed += 1;
    console.warn('Could not finish removing sample rows for good:', err);
  }

  return { removed, failed };
}

type Cloud = { client: ReturnType<typeof expenseCloud.getSupabase>; userId: string } | 'none' | 'blocked';

/** Whether a cloud backup holds this kind of data for this person: not set up, signed in, or set up but signed out. */
async function cloudFor(mod: typeof expenseCloud): Promise<Cloud> {
  if (!mod.isConfigured()) return 'none';
  try {
    const userId = await mod.currentUserId();
    return userId ? { client: mod.getSupabase(), userId } : 'blocked';
  } catch {
    return 'blocked';
  }
}

type Db = { runAsync: (sql: string, ...params: any[]) => Promise<unknown> };

/**
 * Physically delete the given sample rows from this phone and from the cloud
 * backup. Per table: the cloud copy goes first, and only if that worked (or
 * there is no backup) are the local rows deleted; otherwise they stay hidden
 * so the deletion can still reach the backup on a later sync.
 */
async function purgeForGood(all: SampleDataFound): Promise<{ failed: number }> {
  const expense = await getExpenseDb();
  const perai = getPeraiDb();
  const money = await cloudFor(expenseCloud);
  const notes = await cloudFor(peraiCloud);
  let failed = 0;

  // Refunds and paybacks the sample expenses generated are rows of their own.
  const linkedIncome: string[] = [];
  if (all.expenseIds.length > 0) {
    const marks = all.expenseIds.map(() => '?').join(',');
    const rows = await expense
      .getAllAsync<{ refund_income_id: string | null; reimburse_income_id: string | null }>(
        `SELECT refund_income_id, reimburse_income_id FROM expenses WHERE id IN (${marks})`,
        ...all.expenseIds
      )
      .catch(() => []);
    for (const r of rows) for (const id of [r.refund_income_id, r.reimburse_income_id]) if (id) linkedIncome.push(id);
  }
  const incomeIds = [...new Set([...all.incomeIds, ...linkedIncome])];

  const steps: { db: Db; table: string; column: string; ids: string[]; cloud: Cloud | null; cloudTable?: string }[] = [
    // Children before parents.
    { db: expense, table: 'expense_items', column: 'expense_id', ids: all.expenseIds, cloud: money, cloudTable: 'expense_items' },
    { db: expense, table: 'memory_expense_links', column: 'expense_id', ids: all.expenseIds, cloud: money, cloudTable: 'memory_expense_links' },
    { db: expense, table: 'memory_expense_links', column: 'memory_id', ids: all.memoryIds, cloud: money, cloudTable: 'memory_expense_links' },
    { db: expense, table: 'expenses', column: 'id', ids: all.expenseIds, cloud: money, cloudTable: 'expenses' },
    { db: expense, table: 'income', column: 'id', ids: incomeIds, cloud: money, cloudTable: 'income' },
    { db: expense, table: 'recurring', column: 'id', ids: all.recurringIds, cloud: money, cloudTable: 'recurring' },
    // Kept on this phone only, so there is no cloud copy to delete.
    { db: expense, table: 'borrow_lend', column: 'id', ids: all.loanIds, cloud: null },
    { db: expense, table: 'accounts', column: 'id', ids: all.accountIds, cloud: null },
    { db: expense, table: 'tagged_places', column: 'id', ids: all.placeIds, cloud: null },
    { db: expense, table: 'tagged_users', column: 'id', ids: all.personIds, cloud: null },
    { db: perai, table: 'memories', column: 'id', ids: all.memoryIds, cloud: notes, cloudTable: 'memories' },
  ];

  for (const step of steps) {
    if (step.ids.length === 0) continue;
    try {
      if (step.cloud === 'blocked') continue; // signed out: keep them hidden until the deletion can sync
      if (step.cloud && step.cloud !== 'none' && step.cloudTable) {
        const { error } = await step.cloud.client
          .from(step.cloudTable)
          .delete()
          .in(step.column, step.ids)
          .eq('user_id', step.cloud.userId);
        if (error) throw error;
      }
      for (let i = 0; i < step.ids.length; i += 200) {
        const chunk = step.ids.slice(i, i + 200);
        await step.db.runAsync(
          `DELETE FROM ${step.table} WHERE ${step.column} IN (${chunk.map(() => '?').join(',')})`,
          ...chunk
        );
      }
    } catch (err) {
      failed += 1;
      console.warn(`Could not delete sample rows from ${step.table} for good:`, err);
    }
  }
  return { failed };
}
