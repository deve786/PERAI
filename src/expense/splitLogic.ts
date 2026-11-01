const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * An expense split into items has one total, and two ways to get it:
 *
 * - open: the total is whatever the items add up to (add an item, it grows);
 * - fixed: the total you typed stays put and the items only describe it.
 */
export function splitTotal(opts: { fixed: boolean; typed: number; itemsSum: number }): number {
  const n = opts.fixed ? opts.typed : opts.itemsSum;
  return Number.isFinite(n) ? round2(n) : 0;
}

/** How the items compare with a fixed total: what is left to account for, or how far over they are. */
export function splitBalance(total: number, itemsSum: number): { left: number; over: number } {
  const diff = round2(total - itemsSum);
  return { left: diff > 0 ? diff : 0, over: diff < 0 ? -diff : 0 };
}

/**
 * When a saved expense is opened again: was its total fixed? It was if the
 * items do not add up to it (a bill's tax, items kept without a price).
 */
export function wasTotalFixed(total: number, itemsSum: number, itemCount: number): boolean {
  return itemCount > 0 && Math.abs(round2(total) - round2(itemsSum)) > 0.005;
}
