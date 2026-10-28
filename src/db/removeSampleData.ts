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
 * Removal goes through the same delete calls the app uses everywhere, so the
 * account balances, links and cloud copies are tidied the same way as for any
 * other delete, and the removal travels to the backup on the next sync.
 */
import { deleteMemories } from './queries';
import { getDb as getPeraiDb } from './client';
import { deleteExpense, deleteIncome, deleteRecurring, getDb as getExpenseDb } from '../expense/db';
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
  documentIds: string[];
  websiteIds: string[];
  telegramChannelIds: string[];
  telegramMessageIds: string[];
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

/** Look, without changing anything. */
export async function findSampleData(): Promise<SampleDataFound> {
  const perai = getPeraiDb();
  const expense = await getExpenseDb();
  const sources = await getSourcesDb();

  const memoryIds: string[] = [];
  for (const sample of SAMPLE_MEMORIES) {
    const rows = await perai.getAllAsync<{ id: string }>(
      'SELECT id FROM memories WHERE deleted = 0 AND title = ? AND raw_input = ?',
      [sample.title, sample.rawInput]
    );
    memoryIds.push(...rows.map((row) => row.id));
  }

  const expenseIds: string[] = [];
  for (const sample of SAMPLE_EXPENSES) {
    const rows = await expense.getAllAsync<{ id: string }>(
      'SELECT id FROM expenses WHERE deleted = 0 AND note = ? AND notes = ? AND ABS(amount - ?) < ?',
      sample.note, sample.notes, sample.amount, AMOUNT_SLACK
    );
    expenseIds.push(...rows.map((row) => row.id));
  }

  const recurringIds: string[] = [];
  for (const sample of SAMPLE_RECURRING) {
    const row = await expense.getFirstAsync<{ id: string }>(
      'SELECT id FROM recurring WHERE deleted = 0 AND id = ? AND note = ?',
      sample.id, sample.note
    );
    if (row) recurringIds.push(row.id);
  }

  // A sample bill that already came due made an expense of its own; it goes too.
  if (recurringIds.length > 0) {
    const placeholders = recurringIds.map(() => '?').join(',');
    const generated = await expense
      .getAllAsync<{ id: string }>(
        `SELECT id FROM expenses WHERE deleted = 0 AND recurring_id IN (${placeholders})`,
        ...recurringIds
      )
      .catch(() => [] as { id: string }[]);
    for (const row of generated) if (!expenseIds.includes(row.id)) expenseIds.push(row.id);
  }

  const incomeIds: string[] = [];
  for (const sample of SAMPLE_INCOME) {
    const rows = await expense.getAllAsync<{ id: string }>(
      'SELECT id FROM income WHERE deleted = 0 AND note = ? AND notes = ? AND ABS(amount - ?) < ?',
      sample.note, sample.notes, sample.amount, AMOUNT_SLACK
    );
    incomeIds.push(...rows.map((row) => row.id));
  }

  const loanIds: string[] = [];
  for (const sample of SAMPLE_LOANS) {
    const rows = await expense
      .getAllAsync<{ id: string }>(
        'SELECT id FROM borrow_lend WHERE deleted = 0 AND person_name = ? AND notes = ? AND ABS(amount - ?) < ?',
        sample.person, sample.notes, sample.amount, AMOUNT_SLACK
      )
      .catch(() => [] as { id: string }[]);
    loanIds.push(...rows.map((row) => row.id));
  }

  const accountIds: string[] = [];
  for (const sample of SAMPLE_ACCOUNTS) {
    const row = await expense
      .getFirstAsync<{ id: string }>(
        'SELECT id FROM accounts WHERE deleted = 0 AND id = ? AND name = ?',
        sample.id, sample.name
      )
      .catch(() => null);
    if (row) accountIds.push(row.id);
  }

  const budgetCategoryIds: string[] = [];
  for (const sample of SAMPLE_BUDGETS) {
    const row = await expense.getFirstAsync<{ id: string }>(
      'SELECT id FROM categories WHERE deleted = 0 AND name = ? AND ABS(monthly_budget - ?) < ?',
      sample.category, sample.amount, AMOUNT_SLACK
    );
    if (row) budgetCategoryIds.push(row.id);
  }

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
    documentIds,
    websiteIds,
    telegramChannelIds,
    telegramMessageIds,
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

  return { removed, failed };
}
