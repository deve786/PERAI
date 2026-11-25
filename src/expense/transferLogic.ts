import type { PassbookEntry } from './passbookLogic';

/** Money moved from one of your own accounts to another — today, a cash withdrawal at an ATM. */
export interface Transfer {
  id: string;
  date: string; // YYYY-MM-DD
  from_account_id: string;
  to_account_id: string;
  amount: number;
  note: string;
  created_at: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** What a transfer does to each side: the bank loses the amount, the cash wallet gains it. */
export function transferDeltas(amount: number): { from: number; to: number } {
  const a = round2(amount);
  return { from: -a, to: a };
}

/** Whether a withdrawal can be saved, and if not, why. */
export function withdrawalProblem(input: {
  amount: number;
  fromBalance: number | null;
}): string | null {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return 'Enter how much you took out.';
  if (input.fromBalance !== null && input.amount > input.fromBalance + 0.001) {
    return 'That is more than the balance in this account.';
  }
  return null;
}

/**
 * Passbook rows for transfers.
 *
 * One account selected: the bank shows money out, the cash wallet money in —
 * only for the side that account is on. All accounts: one neutral row,
 * because the total did not move.
 */
export function transferEntries(
  transfers: Transfer[],
  nameOf: (accountId: string) => { name: string; institution?: string },
  accountId?: string | null
): PassbookEntry[] {
  const out: PassbookEntry[] = [];
  for (const t of transfers) {
    const from = nameOf(t.from_account_id);
    const to = nameOf(t.to_account_id);
    const fromLabel = (from.institution || '').trim() || from.name;
    const toLabel = (to.institution || '').trim() || to.name;
    const base = {
      date: t.date,
      amount: t.amount,
      netAmount: t.amount,
      title: 'ATM withdrawal',
      subtitle: t.note ? `${fromLabel} → ${toLabel} · ${t.note}` : `${fromLabel} → ${toLabel}`,
      category: 'ATM withdrawal',
      categoryIcon: 'cash-outline',
      categoryColor: '#5B7F95',
      method: 'ATM',
      updatedAt: t.created_at,
    };
    if (!accountId) {
      out.push({ ...base, id: `xfer-${t.id}`, type: 'out', neutral: true, accountId: t.from_account_id, accountName: fromLabel, accountInstitution: from.institution });
    } else if (accountId === t.from_account_id) {
      out.push({ ...base, id: `xfer-${t.id}`, type: 'out', accountId: t.from_account_id, accountName: fromLabel, accountInstitution: from.institution });
    } else if (accountId === t.to_account_id) {
      out.push({ ...base, id: `xfer-${t.id}`, type: 'in', accountId: t.to_account_id, accountName: toLabel, accountInstitution: to.institution });
    }
  }
  return out;
}
