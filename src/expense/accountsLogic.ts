export type AccountType = 'bank' | 'stock' | 'cash' | 'crypto' | 'other';

export interface AccountItem {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  currency: string;
  notes: string;
  institution: string;
  updated_at: string;
  dirty: number;
  deleted: number;
  /** Stocks: the money put in. Null on stocks saved before this was tracked — their whole value counts as invested. */
  invested?: number | null;
  /** Stocks: how that money was paid ('UPI', 'Cash', …, 'None'), and from which bank/cash account. */
  pay_method?: string;
  pay_account_id?: string | null;
}

export interface StockGain {
  invested: number;
  value: number;
  /** value − invested; negative for a loss. */
  profit: number;
  /** profit as a % of invested, or null when nothing was invested. */
  percent: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A stock's invested amount, current value and profit. The value is what's stored as its balance (and counted in net worth). */
export function stockGain(acc: Pick<AccountItem, 'balance' | 'invested'>): StockGain {
  const value = round2(acc.balance || 0);
  const invested = round2(acc.invested ?? value);
  const profit = round2(value - invested);
  return {
    invested,
    value,
    profit,
    percent: invested > 0 ? Math.round((profit / invested) * 1000) / 10 : null,
  };
}

export interface NetWorthSummary {
  bankTotal: number;
  stockTotal: number;
  cashTotal: number;
  cryptoTotal: number;
  otherTotal: number;
  liquidTotal: number; // bank + cash
  totalWithStocks: number; // liquid + stock
  totalWithLend: number; // liquid + stock + lent
  totalAssets: number; // all assets
  totalLent: number; // active lent to others
  totalBorrowed: number; // active debt owed to others
  netWorth: number; // (totalAssets + totalLent) - totalBorrowed
  accountsCount: number;
}

export function computeNetWorth(
  accounts: Pick<AccountItem, 'type' | 'balance'>[],
  blSummary: { totalLentActive: number; totalBorrowedActive: number }
): NetWorthSummary {
  let bankTotal = 0;
  let stockTotal = 0;
  let cashTotal = 0;
  let cryptoTotal = 0;
  let otherTotal = 0;

  for (const acc of accounts) {
    const val = acc.balance || 0;
    switch (acc.type) {
      case 'bank':
        bankTotal += val;
        break;
      case 'stock':
        stockTotal += val;
        break;
      case 'cash':
        cashTotal += val;
        break;
      case 'crypto':
        cryptoTotal += val;
        break;
      default:
        otherTotal += val;
        break;
    }
  }

  const liquidTotal = bankTotal + cashTotal;
  const totalWithStocks = liquidTotal + stockTotal;
  const totalAssets = liquidTotal + stockTotal + cryptoTotal + otherTotal;
  const totalLent = blSummary.totalLentActive;
  const totalBorrowed = blSummary.totalBorrowedActive;
  const totalWithLend = totalWithStocks + totalLent;
  const netWorth = totalAssets + totalLent - totalBorrowed;

  const r2 = (n: number) => Math.round(n * 100) / 100;

  return {
    bankTotal: r2(bankTotal),
    stockTotal: r2(stockTotal),
    cashTotal: r2(cashTotal),
    cryptoTotal: r2(cryptoTotal),
    otherTotal: r2(otherTotal),
    liquidTotal: r2(liquidTotal),
    totalWithStocks: r2(totalWithStocks),
    totalWithLend: r2(totalWithLend),
    totalAssets: r2(totalAssets),
    totalLent: r2(totalLent),
    totalBorrowed: r2(totalBorrowed),
    netWorth: r2(netWorth),
    accountsCount: accounts.length,
  };
}
