/**
 * Per-category monthly budgets: how much of each is used, and when that is
 * worth saying something about.
 *
 * Pure, like repeat.ts and reminderTime.ts, so the thresholds and the edge
 * cases are unit tested in plain Node. Everything here works on totals that
 * have already been summed by the database — see categorySpendThisMonth in
 * src/expense/db.ts for the grouped query that feeds it.
 */
import type { Category } from './db';

/** Where a budget stops being comfortable, and where it is gone. */
export const WARN_AT = 0.7;
export const FULL_AT = 1;
/** The points worth interrupting someone for, after they save an expense. */
export const ALERT_THRESHOLDS = [0.8, 1] as const;

export type BudgetTone = 'good' | 'warn' | 'over';

export interface CategoryBudget {
  id: string;
  name: string;
  color: string;
  icon: string;
  budget: number;
  spent: number;
  /** Spent over budget. 0.5 is half used; 1.2 is a fifth over. */
  fraction: number;
  tone: BudgetTone;
  /** Negative once it is over. */
  remaining: number;
}

/** Green below 70%, amber from 70% up to full, red once it is over. */
export function budgetTone(fraction: number): BudgetTone {
  if (fraction > FULL_AT) return 'over';
  if (fraction >= WARN_AT) return 'warn';
  return 'good';
}

/**
 * The categories worth showing a meter for: the ones with a budget set,
 * most-used first.
 *
 * A category with no budget is left out entirely rather than shown at zero —
 * not setting a budget is a choice, not an empty one. A budget of zero is
 * treated the same way, since a meter against zero says nothing.
 *
 * @param spentByCategory totals for the month, keyed by category id
 */
export function categoryBudgetStatus(
  categories: Category[],
  spentByCategory: Map<string, number>
): CategoryBudget[] {
  const withBudget = categories.filter(
    (category) => category.monthly_budget !== null && category.monthly_budget > 0
  );

  return withBudget
    .map((category) => {
      const budget = category.monthly_budget as number;
      const spent = spentByCategory.get(category.id) ?? 0;
      const fraction = spent / budget;
      return {
        id: category.id,
        name: category.name,
        color: category.color,
        icon: category.icon,
        budget,
        spent,
        fraction,
        tone: budgetTone(fraction),
        remaining: budget - spent,
      };
    })
    .sort((a, b) => b.fraction - a.fraction || b.spent - a.spent);
}

export interface BudgetTotals {
  /** Every category budget added up. */
  allocated: number;
  /** The overall monthly budget, or 0 when none is set. */
  overall: number;
  /** Overall minus allocated: negative means the categories promise more. */
  unallocated: number;
  overAllocated: boolean;
}

export function budgetTotals(categories: Category[], overall: number): BudgetTotals {
  const allocated = categories.reduce(
    (total, category) => total + (category.monthly_budget ?? 0),
    0
  );
  return {
    allocated,
    overall,
    unallocated: overall - allocated,
    overAllocated: overall > 0 && allocated > overall,
  };
}

/**
 * The threshold an expense has just taken a category past, or null.
 *
 * Crossing is judged between the totals before and after, so saving into a
 * category that was already over says nothing — the point is the moment it
 * changes, not every expense afterwards. The caller remembers which
 * thresholds it has already mentioned this month (see src/expense/db.ts
 * settings), so this stays pure.
 */
export function crossedThreshold(
  budget: number | null,
  spentBefore: number,
  spentAfter: number
): number | null {
  if (budget === null || budget <= 0) return null;

  let crossed: number | null = null;
  for (const threshold of ALERT_THRESHOLDS) {
    const mark = budget * threshold;
    if (spentBefore < mark && spentAfter >= mark) crossed = threshold;
  }
  return crossed;
}
