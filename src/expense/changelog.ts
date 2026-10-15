export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM-DD
  highlights: string[];
}

/** Newest first. Add a new entry here with every release that changes user-visible behaviour. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.14.0',
    date: '2026-10-15',
    highlights: [
      'Manglish, spoken or typed: say "nale rahul-ne kaanaan undu" or "innale 500 roopa petrol adichu" and it is understood, with amounts like "randu ayiram" and "anjuru" read as numbers',
      'Settings → Voice language: keep your phone\'s own, or pick English (India), Malayalam, or Mixed; Settings → Save titles in chooses English or the language you spoke',
      'Asking in Malayalam works without a translation step — "innale entha chelavaayathu" is answered straight from your record, and the answer comes back in the language you asked in',
      'Ask can now reschedule, tick off, reopen, re-prioritise, correct an amount, change a category, add a new entry or delete — each shown as before → after before anything happens',
      'Manglish instructions too: "dentist nale maattu", "gym kazhinju", "aa entry delete cheyyu"',
      'Nothing is applied silently: unknown entries, dates already gone and batches over 20 are refused, an unclear instruction is asked about, and anything reversible offers Undo',
    ],
  },
  {
    version: '1.13.0',
    date: '2026-10-15',
    highlights: [
      'Trip Spending: Link expenses directly to trip memories, auto-suggest expenses during trip dates, and view multi-currency totals & category breakdowns',
      'Ask Trip Costs: Ask "how much did I spend on my Kozhikode trip" or "what did the Goa trip cost" in Ask for instant totals',
      'Category Budgets: Set monthly budget limits per category, see spending progress bars, and receive 80% and 100% threshold alerts',
    ],
  },
  {
    version: '1.12.0',
    date: '2026-10-15',
    highlights: [
      'Net Worth & Wealth Hub: Track money across Bank accounts, Stocks, Cash, Crypto, and custom assets',
      'Flexible Total Wealth Filters: Instantly view your total amount with or without Money Lent, Stocks, and liabilities',
      'Borrow & Lend tracking: Record money borrowed or lent with transaction dates, repayment tracking, and status chips',
      'Ask can now do things, not just answer: say "mark the bank call done", "push everything to tomorrow", "delete last week\'s coffee expenses" or "set my budget to 20k"',
      'Every change is shown for confirmation first, with the exact entries it would touch — and anything reversible gets an Undo afterwards',
      'Asking questions costs exactly what it did before: an instruction is recognised on the phone, so only a real command spends an extra call',
      'Insights now splits into two tabs, Expense and PERAI, so each half reads on its own',
      'Added "What do these mean?" to Insights, explaining Captured, Spent, Net, Overdue, Day streak and the rest in plain words',
    ],
  },
  {
    version: '1.11.0',
    date: '2026-10-15',
    highlights: [
      'New Insights tab: one review of both halves of the app — what you spent, what you captured, what is still open, with charts and a comparison against the period before',
      'One app, one navigation: the mode switch is gone and every screen now lives in a single tab bar',
      'Expense is now the second tab, Calendar the third',
      'Calendar decluttered: no more duplicate summary bars, and a day with nothing on it stays quiet',
      'Quick Note and Brain Dump merged into a single capture box — it always picks apart everything you say',
      'Upcoming Bills only appears once you actually have a recurring bill',
      'Fixed receipt scanning, which had stopped working after Gemini retired the model it used',
    ],
  },
  {
    version: '1.0.14',
    date: '2026-10-14',
    highlights: [
      'AI Expense Title Generation: one-tap "AI Title" button generates a clean title from your split items, category, and notes',
      'Moved AI button to Expense Title for quick title suggestions',
      'Cleaner split items workflow without unwanted item naming popups',
    ],
  },
  {
    version: '1.0.13',
    date: '2026-10-14',
    highlights: [
      'Split items strictly take their names from the expense title',
      'No random or hallucinated item names',
      'Splitting into items immediately seeds with the expense title',
    ],
  },
  {
    version: '1.0.12',
    date: '2026-10-14',
    highlights: [
      'AI item naming for split items: automatically generates and names items from your expense title',
      'Replaces existing or placeholder item names with clean AI names',
      'One-tap "AI name items" button in the split items section',
    ],
  },
  {
    version: '1.0.11',
    date: '2026-10-14',
    highlights: [
      'Tag person / For user: tag who a purchase was for with one tap',
      'Saved people: remembered automatically so you never have to re-type',
      'Search expenses by tagged person in History',
      'AI Diagnostics & live log viewer in Settings',
    ],
  },
  {
    version: '1.0.10',
    date: '2026-10-14',
    highlights: [
      'Added this "What\'s New" screen (Settings → What\'s New)',
    ],
  },
  {
    version: '1.0.9',
    date: '2026-10-14',
    highlights: [
      'Category always resolves to a real one now — falls back to "Other" instead of leaving a stale or unrelated category selected',
    ],
  },
  {
    version: '1.0.8',
    date: '2026-10-14',
    highlights: [
      'Swipe left to delete, right to edit, on any expense or income row',
      'AI can invent a brand-new category instead of forcing everything into "Other"',
      '"Add expense" is now the primary button on Home; "Add income" is a smaller secondary link',
      'Fixed category auto-pick not updating when editing an existing expense\'s title',
    ],
  },
  {
    version: '1.0.7',
    date: '2026-10-14',
    highlights: [
      'AI suggests a category when typing a title the keyword list doesn\'t recognise, with a loading indicator',
    ],
  },
  {
    version: '1.0.6',
    date: '2026-10-14',
    highlights: [
      'Optional backup to your account (Settings → Backup) — syncs automatically after every add, edit, or delete',
      'Home now shows spend vs. last month',
    ],
  },
  {
    version: '1.0.5',
    date: '2026-10-14',
    highlights: [
      'Switched every entry to a unique ID, laying the groundwork for backup and multi-device sync',
    ],
  },
  {
    version: '1.0.4',
    date: '2026-10-14',
    highlights: [
      'In-app confirmation dialog replaces the native delete pop-up',
      'Delete button added directly in view mode, not just long-press',
    ],
  },
  {
    version: '1.0.3',
    date: '2026-10-14',
    highlights: [
      'Income tracking: new Add Income screen, income/net stats on Home, merged History feed',
      'Tapping an entry now opens it to view first; edit and long-press-delete are separate actions',
    ],
  },
  {
    version: '1.0.1',
    date: '2026-10-13',
    highlights: [
      'Added a separate Notes field alongside Title',
      'CSV export updated to match',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-10-13',
    highlights: [
      'Spendly is born — expense tracking with categories, recurring expenses, and a chat assistant',
    ],
  },
];
