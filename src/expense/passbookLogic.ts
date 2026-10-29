import { fmtMoney } from './stats';
import { addDays, fromStr, prettyDate, todayStr } from './dates';

export interface PassbookEntry {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'in' | 'out'; // 'in' = Money In / Credit / Income, 'out' = Money Out / Debit / Spent
  amount: number;
  netAmount: number;
  refundAmount?: number | null;
  reimburseAmount?: number | null;
  title: string;
  subtitle: string;
  category: string;
  categoryIcon: string;
  categoryColor: string;
  method: string;
  accountId: string | null;
  accountName: string;
  accountInstitution?: string;
  userTag?: string;
  place?: string;
  updatedAt?: string;
  runningBalance?: number;
}

export interface PassbookSummary {
  totalIn: number;
  totalOut: number;
  netFlow: number;
  count: number;
}

export interface DayPassbookGroup {
  date: string;
  heading: string;
  items: PassbookEntry[];
  dayIn: number;
  dayOut: number;
  dayNet: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function passbookDayHeading(date: string): string {
  const t = todayStr();
  if (date === t || date === addDays(t, -1)) return prettyDate(date);
  return `${WEEKDAYS[fromStr(date).getDay()]} ${prettyDate(date)}`;
}

export function computePassbookSummary(entries: PassbookEntry[]): PassbookSummary {
  let totalIn = 0;
  let totalOut = 0;

  for (const entry of entries) {
    if (entry.type === 'in') {
      totalIn += entry.amount;
    } else {
      totalOut += entry.amount;
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    totalIn: round2(totalIn),
    totalOut: round2(totalOut),
    netFlow: round2(totalIn - totalOut),
    count: entries.length,
  };
}

export function sourceBadge(entry: PassbookEntry): { label: string; isSource: boolean } {
  const name = entry.accountName || entry.method || 'Unassigned';
  if (entry.type === 'out') {
    return { label: `From ${name}`, isSource: true };
  }
  return { label: `Into ${name}`, isSource: false };
}

export function groupPassbookByDate(entries: PassbookEntry[]): DayPassbookGroup[] {
  const groups: DayPassbookGroup[] = [];
  const map = new Map<string, PassbookEntry[]>();

  for (const entry of entries) {
    const list = map.get(entry.date) ?? [];
    list.push(entry);
    map.set(entry.date, list);
  }

  // Sort dates descending
  const sortedDates = [...map.keys()].sort((a, b) => b.localeCompare(a));

  for (const date of sortedDates) {
    const items = map.get(date) ?? [];
    let dayIn = 0;
    let dayOut = 0;

    for (const it of items) {
      if (it.type === 'in') {
        dayIn += it.amount;
      } else {
        dayOut += it.amount;
      }
    }

    groups.push({
      date,
      heading: passbookDayHeading(date),
      items,
      dayIn: Math.round(dayIn * 100) / 100,
      dayOut: Math.round(dayOut * 100) / 100,
      dayNet: Math.round((dayIn - dayOut) * 100) / 100,
    });
  }

  return groups;
}

/**
 * Calculates and attaches the running balance to each transaction entry,
 * matching how a bank passbook statement displays the account balance at each point in time.
 * Entries must be sorted in descending order (newest first).
 */
export function attachRunningBalances(
  entries: PassbookEntry[],
  currentBalance: number
): PassbookEntry[] {
  let rolling = currentBalance;
  return entries.map((entry) => {
    const bal = Math.round(rolling * 100) / 100;
    const delta = entry.amount;
    if (entry.type === 'in') {
      rolling = Math.round((rolling - delta) * 100) / 100;
    } else {
      rolling = Math.round((rolling + delta) * 100) / 100;
    }
    return {
      ...entry,
      runningBalance: bal,
    };
  });
}
