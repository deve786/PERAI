/**
 * Choosing the bank and category for a payment shared from GPay — pure, so
 * the matching rules are unit tested in plain Node (scripts/test-logic.ts).
 * The database and AI halves live in sharedPayment.ts and ai/ocr.ts.
 */

export interface BankAccountLike {
  id: string;
  name: string;
  institution: string;
  notes: string;
}

export interface PastExpenseLike {
  note: string;
  method: string;
  category_id: string;
  account_id?: string | null;
}

/** Words that say nothing about which bank it is. */
const FILLER = new Set(['bank', 'ltd', 'limited', 'the', 'of', 'co', 'ac', 'account', 'acct', 'savings', 'saving', 'current', 'india', 'upi']);

/**
 * Full names of common Indian banks, folded to the short name people and
 * apps also use — so "State Bank of India" and "SBI" are the same bank, and
 * "Bank of India" doesn't vanish into filler words. Longer names first, so
 * "State Bank of India" is never read as "Bank of India".
 */
const SHORT_NAMES: [RegExp, string][] = [
  [/\bstate bank( of india)?\b/g, 'sbi'],
  [/\bunion bank( of india)?\b/g, 'ubi'],
  [/\bcentral bank( of india)?\b/g, 'cbi'],
  [/\bbank of baroda\b/g, 'bob'],
  [/\bbank of maharashtra\b/g, 'bom'],
  [/\bbank of india\b/g, 'boi'],
  [/\bpunjab national( bank)?\b/g, 'pnb'],
  [/\bindian overseas( bank)?\b/g, 'iob'],
  [/\bkarur vysya( bank)?\b/g, 'kvb'],
];

function tokens(text: string): string[] {
  let folded = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  for (const [full, short] of SHORT_NAMES) folded = folded.replace(full, short);
  const words = folded
    .split(' ')
    .filter((w) => w.length > 1 && !FILLER.has(w) && !/^\d+$/.test(w));
  return [...new Set(words)];
}

/** The last 4 digits shown with a masked account number ("••1234", "XX1234"), if any. */
export function lastFour(text: string): string | null {
  const match = text.match(/(\d{4})(?!.*\d)/);
  return match ? match[1] : null;
}

/**
 * The saved bank account a GPay "paid using" line refers to, or null.
 *
 * The last 4 digits win outright when an account mentions them (in its name,
 * institution or notes); otherwise the account sharing the most meaningful
 * words with the line — "HDFC Bank ••1234" matches an account named "HDFC",
 * "SBI" one at "State Bank of India".
 */
export function matchBankLine(line: string | null, accounts: BankAccountLike[]): string | null {
  if (!line || !line.trim() || accounts.length === 0) return null;

  const digits = lastFour(line);
  if (digits) {
    const byDigits = accounts.find((a) => `${a.name} ${a.institution} ${a.notes}`.includes(digits));
    if (byDigits) return byDigits.id;
  }

  const wanted = new Set(tokens(line));
  if (wanted.size === 0) return null;

  let best: { id: string; score: number } | null = null;
  for (const account of accounts) {
    const have = tokens(`${account.name} ${account.institution}`);
    const score = have.filter((t) => wanted.has(t)).length;
    if (score > 0 && (!best || score > best.score)) best = { id: account.id, score };
  }
  return best?.id ?? null;
}

/**
 * Which bank a UPI payment came from: what GPay's card says if it matches a
 * saved account; the only bank account if there's just one; otherwise the
 * bank last used for a UPI payment. Null when there's nothing to go on.
 *
 * @param history past expenses, newest first
 */
export function pickBankAccount(
  line: string | null,
  accounts: BankAccountLike[],
  history: PastExpenseLike[]
): string | null {
  if (accounts.length === 0) return null;
  const fromLine = matchBankLine(line, accounts);
  if (fromLine) return fromLine;
  if (accounts.length === 1) return accounts[0].id;

  const known = new Set(accounts.map((a) => a.id));
  const lastUpi = history.find((e) => e.method === 'UPI' && e.account_id && known.has(e.account_id));
  return lastUpi?.account_id ?? null;
}

/**
 * The category a payment to `payee` was filed under last time, if it was
 * paid before — the person's own choice, so it beats any guess.
 *
 * @param history past expenses, newest first
 * @param categoryIds ids of the categories that still exist
 */
export function categoryFromHistory(
  payee: string | null,
  history: PastExpenseLike[],
  categoryIds: Set<string>
): string | null {
  const name = payee?.trim().toLowerCase();
  if (!name) return null;
  const previous = history.find(
    (e) => e.note.trim().toLowerCase() === name && categoryIds.has(e.category_id)
  );
  return previous?.category_id ?? null;
}

/** The category name the AI picked, if it's one that actually exists (matched case-insensitively). */
export function knownCategoryName(picked: string | null, names: string[]): string | null {
  if (!picked) return null;
  const wanted = picked.trim().toLowerCase();
  return names.find((n) => n.toLowerCase() === wanted) ?? null;
}
