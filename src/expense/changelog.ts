export interface ChangelogEntry {
  version: string;
  build?: number;
  type?: 'build' | 'ota';
  date: string; // YYYY-MM-DD
  time?: string; // e.g. "09:23 AM"
  highlights: string[];
}

/** Newest first. Add a new entry here with every release that changes user-visible behaviour. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.30.37',
    build: 140,
    type: 'ota',
    date: '2026-10-25',
    time: '09:25 AM',
    highlights: [
      'Display release date and time for each build and update in What\'s new',
    ],
  },
  {
    version: '1.30.36',
    build: 139,
    type: 'ota',
    date: '2026-10-25',
    time: '09:23 AM',
    highlights: [
      'Permanently clear and delete documents in cloud and local',
    ],
  },
  {
    version: '1.30.35',
    build: 138,
    type: 'ota',
    date: '2026-10-25',
    time: '09:16 AM',
    highlights: [
      'Fix document deletion touch handling and remove indexed chunks',
    ],
  },
  {
    version: '1.30.34',
    build: 137,
    type: 'ota',
    date: '2026-10-25',
    time: '09:05 AM',
    highlights: [
      'Display build numbers and release types (OTA Update vs New Build) in What\'s new screen',
    ],
  },
  {
    version: '1.30.33',
    build: 136,
    type: 'ota',
    date: '2026-10-25',
    time: '08:50 AM',
    highlights: [
      'Telegram auto-update: automatically checks for updates in background every 5 minutes (customizable to 5m, 15m, 30m, 1h, or Off in Data Sources)',
      'Incremental Telegram sync: only checks and downloads brand-new messages since your last sync, taking ~0.2s when up to date and saving battery and mobile data',
    ],
  },
  {
    version: '1.30.32',
    build: 135,
    type: 'ota',
    date: '2026-10-25',
    highlights: [
      'Deep multi-page website crawler: automatically crawls and extracts all subpages under a website instead of just the landing page',
      'Intelligent subpage retrieval: feeds up to 8,000 characters of relevant subpage content and tables directly into Ask RAG prompts',
      'Live crawling progress indicator showing page count during scraping in Data Sources',
    ],
  },
  {
    version: '1.30.31',
    build: 134,
    type: 'ota',
    date: '2026-10-25',
    highlights: [
      'Draft message while generating: text field remains active so you can type your next question in advance while an answer is generating',
      'Response time badge: displays precise duration (⚡ e.g. 1.2s) on completed answers in Ask tab',
      'Hallucination tag: automatically detects ungrounded or fabricated details and flags them with an inline ⚠️ Unverified tag',
    ],
  },
  {
    version: '1.30.30',
    build: 133,
    type: 'ota',
    date: '2026-10-25',
    highlights: [
      'Cohesive document chunk stitching: ensures markdown schedules and voyage tables across page breaks stay intact',
      'Model grounding improvements to eliminate date hallucinations in travel schedules',
    ],
  },
  {
    version: '1.30.28',
    build: 131,
    type: 'ota',
    date: '2026-10-25',
    highlights: [
      'Groq multi-model support: switch between GPT OSS 120B, Qwen 3.8 27B, and Gemini Flash Lite in Settings',
      'Faster RAG generation with top open-source reasoning models',
    ],
  },
  {
    version: '1.30.0',
    build: 100,
    type: 'build',
    date: '2026-10-24',
    highlights: [
      'Multi-Source Data Hub: search across uploaded Documents (PDF, Word, TXT, Images), Websites, and Telegram channels',
      'Gemini Vision OCR: automatic OCR extraction for posters, timetables, and schedules in English & Malayalam',
      'Unified search in Ask tab with source citations and evidence badges',
    ],
  },
  {
    version: '1.18.0',
    date: '2026-10-19',
    highlights: [
      'Fixed: a finished or struck-through entry showing in Recently Added or Coming Up on Home now shows struck through there too, instead of looking like it\'s still open',
      'If the person an expense was tagged "for" pays you back, say so — same amount or a different one — and pick which bank it landed in; it\'s recorded and that bank\'s balance goes up to match',
      'Ask can now answer anything about an expense, not just the basics — who it was for, which bank, and whether (and how much) was refunded or paid back',
      'Fixed: History, Analytics and Insights no longer show the category name twice on an entry with no title',
      'Added a Ticket type field too — Flight, Ship, Cinema, Train, Bus, Event, or one you add yourself',
      'Added a Ticket category: track cancellations and refunds, splitting the refund by however many of the people on it got their money back',
      'Paying by UPI now asks which bank it came from, and that bank\'s balance drops to match — the same for income (credits the bank) and for paying back or being repaid on a borrow/loan',
      'A group\'s box now takes instructions as well as tasks: "push buy sunscreen to friday", "make the cab high priority", "gym kazhinju" — shown as before → after and applied only once you confirm',
      'An instruction typed in a group can only ever reach that group\'s own entries',
      'What you just added is shown back as a card — like Record does — with UNDO, and EDIT when it is a single entry',
      'A change made from a group offers Undo too, saying what it touched',
    ],
  },
  {
    version: '1.17.0',
    date: '2026-10-16',
    highlights: [
      'Make a group on its own: name it first and fill it later, from the Groups page or straight from Record (＋ NEW GROUP)',
      'Add several tasks at once inside a group — "book tickets, pack bags, get cash" becomes three, instantly, with no waiting',
      'Typed tasks read their own dates: "table parcel by tomorrow 9am" is saved as Table parcel, due tomorrow at 9 — tonight, friday, 5 November, in 3 days and nale all work too',
      'Or say them: spoken tasks are understood first, so "book tickets tomorrow and pack bags on Friday" lands two tasks on two days',
      'The ✨ button beside ADD reads typed text the way the Record tab does — several events at once, amounts, people and places, and a purchase still lands in Expense',
      'Rename a group by editing its heading — every entry in it moves with it',
      'Delete a group, choosing whether to keep its entries or delete them too',
      'Hold any task in a group to edit or delete it; tap still ticks it off',
      'Record now has a Groups button beside Lists and Timeline',
      'Fixed: a task added during the day no longer reads as overdue the moment you write it — with no time said, it lands later today rather than at nine this morning',
      'Fixed: editing a task title or a group name and then leaving the screen now keeps the change, and a SAVE button shows while one is unsaved',
      'Popups are the app\'s own now, not Android\'s — holding a task, deleting a group, settling a loan, scanning a bill all ask in the app\'s own type and colours',
      'A group\'s add box now has CLEAR while typing and CANCEL while listening, the same as Record',
      'Malayalam typed into a group is read properly rather than stored as typed, so it is written down in whichever language Settings says',
    ],
  },
  {
    version: '1.15.0',
    date: '2026-10-16',
    highlights: [
      'Groups: keep the tasks of one job together — a trip, a move, a week at work — with a finish line. More → Groups lists them, overdue first',
      'Say it in one breath: "for the Kozhikode trip: book tickets, pack bags, get cash" files all three under that group. The review screen shows the group and lets you change it for every entry at once',
      'Inside a group you can type tasks straight in, one line each, with no waiting; tick them off, tick off everything left, or ungroup without deleting any of the work',
      'Any entry can be put into a group, or taken out, from its own screen',
      'Ask now hears instructions it used to answer as questions: "make the electricity bill high priority", "the dinner at Paragon was actually 1450", "rename it to…", "cancel the gym reminder"',
      'Ask fixes: an instruction that adds and changes now does both, a delete no longer removes Undo from the other changes beside it, "move it to Fitness" works on entries, and spending from the last year can be corrected rather than only the last four months',
    ],
  },
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
