import type { Memory, MemoryType, Priority } from './types';

/** The three wish lists, in the order the Lists tab shows them. */
export const LISTS = [
  { type: 'play' as const, label: 'PLAYLIST', empty: 'Say "I want to play Hollow Knight".' },
  { type: 'watch' as const, label: 'WATCHLIST', empty: 'Say "add Dune to my watchlist".' },
  { type: 'wish' as const, label: 'WISHLIST', empty: 'Say "I want to buy a standing desk".' },
];

export interface ListSection {
  type: MemoryType;
  label: string;
  empty: string;
  /** Still wanted, most important first, then newest. */
  open: Memory[];
  /** Played, watched or bought, most recently marked first. */
  done: Memory[];
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
const rank = (priority: Priority | null) => (priority ? PRIORITY_RANK[priority] : 3);

/** How many finished items each list keeps on screen under the open ones. */
export const DONE_SHOWN = 5;

export function listSections(memories: Memory[], doneShown = DONE_SHOWN): ListSection[] {
  return LISTS.map(({ type, label, empty }) => {
    const mine = memories.filter((memory) => memory.type === type);
    return {
      type,
      label,
      empty,
      open: mine
        .filter((memory) => memory.status === 'active')
        .sort(
          (a, b) =>
            rank(a.priority) - rank(b.priority) || b.createdAt.localeCompare(a.createdAt)
        ),
      done: mine
        .filter((memory) => memory.status !== 'active')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, doneShown),
    };
  });
}
