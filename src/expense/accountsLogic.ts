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
