export type LoanKind = 'lent' | 'borrowed' | 'request';

/**
 * How a loan changes the balance of the account it was paid from or received
 * into: money you lent leaves it (negative), money you borrowed arrives in it
 * (positive). A request is only asked of you — nothing has moved yet.
 */
export function loanBalanceDelta(type: LoanKind, amount: number): number {
  if (type === 'lent') return -amount;
  if (type === 'borrowed') return amount;
  return 0;
}

/**
 * The part of a loan still to be paid back. What was already paid back was
 * recorded as its own income or expense, so deleting the loan only takes the
 * outstanding part back out of the account.
 */
export function outstandingOf(amount: number, settled: number | null | undefined): number {
  return Math.max(0, amount - (settled || 0));
}
