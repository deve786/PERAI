/**
 * Pure category mapping utilities.
 * Maps keywords in a title or string to a canonical Expense category name.
 * Free of database or native imports so it can be evaluated in plain Node.
 */
export function mapToExpenseCategory(title: string, category?: string): string {
  const combined = `${title} ${category ?? ''}`.toLowerCase();
  if (/food|lunch|dinner|breakfast|snack|coffee|tea|cafe|restaurant|burger|pizza|meal|swiggy|zomato|supermarket|grocery|groceries|bakery/i.test(combined)) {
    return 'Food';
  }
  if (/uber|ola|cab|taxi|auto|bus|train|flight|fuel|petrol|diesel|gas|toll|metro|fare|parking/i.test(combined)) {
    return 'Transport';
  }
  if (/bill|electricity|water|wifi|internet|broadband|recharge|mobile|utility|phone bill|rent/i.test(combined)) {
    return 'Bills';
  }
  if (/medicine|doctor|clinic|pharmacy|hospital|health|gym|fitness|dental|medical/i.test(combined)) {
    return 'Health';
  }
  if (/movie|theatre|cinema|game|concert|netflix|prime|disney|spotify|show|entertainment/i.test(combined)) {
    return 'Entertainment';
  }
  if (/buy|bought|shirt|clothes|shoes|dress|shopping|amazon|flipkart|store|mall|book/i.test(combined)) {
    return 'Shopping';
  }
  return 'Other';
}
