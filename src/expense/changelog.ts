export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM-DD
  highlights: string[];
}

/** Newest first. Add a new entry here with every release that changes user-visible behaviour. */
export const CHANGELOG: ChangelogEntry[] = [
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
