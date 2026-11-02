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

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface RepaymentPlan {
  /** Principal cleared so far, after this repayment. */
  settledAmount: number;
  /** The loan is finished: nothing more is owed or expected. */
  closed: boolean;
  /** Paid back above what was left: interest, or a thank-you. */
  extra: number;
  /** Written off: what was left but not paid back, when the loan is closed anyway. */
  shortfall: number;
  /** Still to come after this repayment. */
  remaining: number;
}

/**
 * What a repayment does to a loan when the amount handed back need not be the
 * amount lent.
 *
 * At least what was left: the loan closes, and anything above is `extra`.
 * Less: either the rest is still owed (a part payment), or the loan is closed
 * anyway and the rest is written off. The money that actually moved is the
 * returned amount, whichever it is — that is what goes into or out of the bank.
 */
export function planRepayment(o: {
  amount: number;
  settled: number | null | undefined;
  returned: number;
  writeOffRest?: boolean;
}): RepaymentPlan {
  const outstanding = outstandingOf(o.amount, o.settled);
  const returned = round2(Math.max(0, o.returned));
  if (returned >= outstanding - 0.005) {
    return { settledAmount: o.amount, closed: true, extra: round2(returned - outstanding), shortfall: 0, remaining: 0 };
  }
  if (o.writeOffRest) {
    return { settledAmount: o.amount, closed: true, extra: 0, shortfall: round2(outstanding - returned), remaining: 0 };
  }
  return {
    settledAmount: round2((o.settled || 0) + returned),
    closed: false,
    extra: 0,
    shortfall: 0,
    remaining: round2(outstanding - returned),
  };
}
