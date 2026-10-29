/**
 * Exactly what "Load Sample Data" writes, row by row.
 *
 * Kept apart from the code that removes it, with no app imports, so a test can
 * hold every line here against src/db/seedData.ts and fail the moment the two
 * drift apart — a sample row the remover no longer recognises would stay in
 * someone's real data for good.
 */

/** Fixed ids, each paired with the name it was given, so an id alone is never enough. */
export const SAMPLE_ACCOUNTS: { id: string; name: string }[] = [
  { id: 'acc-hdfc-01', name: 'HDFC Bank Savings' },
  { id: 'acc-sbi-02', name: 'SBI Salary Account' },
  { id: 'acc-icici-03', name: 'ICICI Coral Credit Card' },
  { id: 'acc-cash-04', name: 'Cash Wallet' },
  { id: 'acc-stock-05', name: 'Nifty 50 Index & Mutual Funds' },
];

export const SAMPLE_RECURRING: { id: string; note: string }[] = [
  { id: 'rec-netflix', note: 'Netflix Premium 4K' },
  { id: 'rec-spotify', note: 'Spotify Family Subscription' },
  { id: 'rec-fiber', note: 'Airtel Fiber Broadband' },
  { id: 'rec-gym', note: 'Cult.fit Gym Monthly' },
];

/** Title, details line and amount, exactly as the seeder wrote them. */
export const SAMPLE_EXPENSES: { note: string; notes: string; amount: number }[] = [
  { note: 'Swiggy Gourmet - Chicken Biryani', notes: 'Lunch at office', amount: 450 },
  { note: 'Cold Brew & Butter Croissant', notes: 'Evening coffee break', amount: 220 },
  { note: 'Weekly Organic Grocery Restock', notes: 'Nature Basket supermarket', amount: 1680 },
  { note: 'Uber Ride to Tech Park', notes: 'Morning office commute', amount: 320 },
  { note: 'IRCTC Tatkal - Train 12626 to Kochi', notes: 'Waiting list not confirmed, refund expected', amount: 1420 },
  { note: 'Metro Smart Card Auto-Topup', notes: 'Station kiosk', amount: 200 },
  { note: 'Weekend Buffet with Friends', notes: 'Barbeque Nation buffet', amount: 2400 },
  { note: 'Car Fuel Refill', notes: 'V-Power Petrol', amount: 2100 },
  { note: 'Multivitamins & First Aid', notes: 'Apollo Pharmacy', amount: 650 },
  { note: 'Autumn Casuals & Chinos', notes: 'Weekend shopping mall', amount: 3850 },
  { note: 'State Electricity Board Bill', notes: 'Home power consumption', amount: 1850 },
  { note: 'Airtel Broadband 200Mbps', notes: 'Monthly fiber internet', amount: 799 },
  { note: 'Cult.fit Gym Monthly Pass', notes: 'Strength & conditioning', amount: 1500 },
  { note: 'IMAX Movie Tickets & Popcorn', notes: 'Weekend evening show', amount: 940 },
];

export const SAMPLE_INCOME: { note: string; notes: string; amount: number }[] = [
  { note: 'October Tech Salary', notes: 'Direct company bank transfer', amount: 85000 },
  { note: 'UI/UX Mobile Design Milestone', notes: 'Client app delivery payment', amount: 12500 },
  { note: 'Index Fund Dividend Payout', notes: 'Quarterly payout', amount: 2000 },
];

export const SAMPLE_LOANS: { person: string; notes: string; amount: number }[] = [
  { person: 'Rahul', notes: 'Concert pass & dinner split', amount: 2500 },
  { person: 'Priya', notes: 'Supermarket bill share', amount: 1200 },
  { person: 'Sarah', notes: 'Airport taxi cash contribution', amount: 800 },
  { person: 'Amit', notes: 'Camera lens security deposit', amount: 5000 },
];

/** Title and the note it was saved from — both must match. */
export const SAMPLE_MEMORIES: { title: string; rawInput: string }[] = [
  { title: 'Review Q4 product roadmap with design team', rawInput: 'Review Q4 product roadmap with design team at 11am' },
  { title: 'Doctor dental routine checkup', rawInput: 'Doctor dental routine checkup at 4:30pm in two days' },
  { title: 'Submit travel expense reimbursements to finance', rawInput: 'Submit travel expense reimbursements to finance tomorrow' },
  { title: 'Pick up dry cleaning & groceries', rawInput: 'Pick up dry cleaning and organic groceries today at 6pm' },
  { title: 'Ideas for next AI voice feature: offline embeddings & local whisper', rawInput: 'Ideas for next AI voice feature: offline embeddings & local whisper model' },
  { title: 'Renew car comprehensive insurance', rawInput: 'Renew car comprehensive insurance before expiry in 4 days' },
  { title: 'Plan weekend hiking trip to Nandi Hills', rawInput: 'Plan weekend hiking trip to Nandi Hills with Alex and Priya' },
  { title: 'Sony WH-1000XM5 Noise Cancelling Headphones', rawInput: 'Sony WH-1000XM5 Noise Cancelling Headphones' },
  { title: 'Dune: Part Two (IMAX Experience)', rawInput: 'Dune: Part Two (IMAX Experience)' },
];

/**
 * Budgets the seeder wrote over, and the exact figure it wrote. A budget is
 * only cleared while it still holds that figure — one changed since is yours.
 */
export const SAMPLE_BUDGETS: { category: string; amount: number }[] = [
  { category: 'Food', amount: 12000 },
  { category: 'Groceries', amount: 8000 },
  { category: 'Shopping', amount: 6000 },
  { category: 'Transport', amount: 4000 },
  { category: 'Utilities', amount: 5000 },
  { category: 'Entertainment', amount: 3000 },
];

export const SAMPLE_DOCUMENTS: { id: string; filename: string }[] = [
  { id: 'doc-ship-schedule', filename: 'Lakshadweep Ship Schedule 2026.pdf' },
  { id: 'doc-portfolio-q3', filename: 'Q3 Financial Portfolio Summary.pdf' },
];

/**
 * The places and people the seeder saved as chips for the expense and income
 * forms (each sample expense carries a place, one a person, and each sample
 * loan its person). Names only: a chip is removed only if no entry of yours
 * still uses that name.
 */
export const SAMPLE_PLACES: string[] = [
  'Swiggy', 'Blue Tokai Cafe', "Nature's Basket", 'Uber', 'Barbeque Nation', 'Shell Petrol Pump',
  'Apollo Pharmacy', 'Zara', 'Airtel Fiber', 'Cult.fit', 'PVR Cinemas',
];
export const SAMPLE_PEOPLE: string[] = ['Rahul', 'Priya', 'Sarah', 'Amit'];

export const SAMPLE_WEBSITE = { id: 'web-1', url: 'https://lakshadweeptourism.gov.in/voyages' };
export const SAMPLE_TELEGRAM_CHANNEL = { id: 'tg-1', username: '@lakshadweep_ship_updates' };
export const SAMPLE_TELEGRAM_MESSAGE_ID = 'tgm-1';
