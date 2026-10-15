/**
 * Telling you when a category's budget is nearly, or fully, spent.
 *
 * The decision itself is pure (crossedThreshold in budgets.ts); this is the
 * part that has to touch the database: what was spent before and after, and
 * which thresholds have already been mentioned this month.
 *
 * The message is left in settings rather than shown where the expense was
 * saved, because that screen closes itself the moment it saves. The Home
 * screen picks it up on focus, so the alert survives the navigation without
 * blocking the save.
 */
import { logFail } from '../log';
import { crossedThreshold } from './budgets';
import { monthRange, todayStr } from './dates';
import { categorySpendBetween, getSetting, listCategories, setSetting } from './db';
import { fmtMoney } from './stats';

const ALERTED_PREFIX = 'budget.alerted.';
const PENDING_KEY = 'budget.alert.pending';

/**
 * Record that a category's budget has just been crossed, if it has.
 *
 * Each threshold is mentioned once per category per month: the stored mark is
 * "YYYY-MM:0.8", so a new month starts the conversation again and a bigger
 * threshold still gets through.
 *
 * @param savedAmount what was just added, used to work out the total before it
 */
export async function noteBudgetCrossing(
  categoryId: string,
  savedAmount: number,
  symbol: string
): Promise<void> {
  try {
    const today = todayStr();
    const month = today.slice(0, 7);
    const { from, to } = monthRange(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1);

    const category = (await listCategories()).find((k) => k.id === categoryId);
    const budget = category?.monthly_budget ?? null;
    if (!category || budget === null || budget <= 0) return;

    const spentAfter = (await categorySpendBetween(from, to)).get(categoryId) ?? 0;
    const crossed = crossedThreshold(budget, spentAfter - savedAmount, spentAfter);
    if (crossed === null) return;

    const key = `${ALERTED_PREFIX}${categoryId}`;
    const already = await getSetting(key, '');
    const mark = `${month}:${crossed}`;
    // Same month, same or higher threshold already said: nothing to add.
    if (already.startsWith(`${month}:`) && Number(already.split(':')[1]) >= crossed) return;

    await setSetting(key, mark);
    await setSetting(
      PENDING_KEY,
      `${category.name}: ${fmtMoney(spentAfter, symbol)} of ${fmtMoney(budget, symbol)} used`
    );
  } catch (err) {
    // A missed alert must never cost someone their expense.
    logFail('Could not check a category budget', err instanceof Error ? err.message : String(err));
  }
}

/** The message waiting to be shown, if any. Reading it clears it. */
export async function takeBudgetAlert(): Promise<string | null> {
  try {
    const pending = await getSetting(PENDING_KEY, '');
    if (!pending) return null;
    await setSetting(PENDING_KEY, '');
    return pending;
  } catch {
    return null;
  }
}
