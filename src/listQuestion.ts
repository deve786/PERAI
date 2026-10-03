/**
 * Questions the app can answer exactly, without asking the AI.
 *
 * "Which games are still to play" is a question about structured data: a type,
 * a state, and a count. Handing that to a model means waiting several seconds,
 * spending quota, and trusting it to enumerate without skipping one — which is
 * exactly what went wrong. Counting rows is something the phone can do itself,
 * instantly and exactly.
 *
 * Pure, so the matching is unit tested in plain Node. Anything this does not
 * recognise falls through to the model as before.
 */
import { fullDateLabel } from './format';
import type { Memory, MemoryType } from './types';

export type ListState = 'pending' | 'done' | 'all';

export interface ListQuestion {
  type: MemoryType;
  state: ListState;
}

const TYPE_WORDS: { type: MemoryType; words: string[] }[] = [
  {
    type: 'watch',
    words: ['watchlist', 'movie', 'movies', 'film', 'films', 'series', 'show', 'shows', 'watch', 'watching', 'watched'],
  },
  { type: 'play', words: ['playlist', 'game', 'games', 'play', 'playing', 'played'] },
  {
    type: 'wish',
    words: ['wishlist', 'wish', 'wishes', 'buy', 'purchase', 'purchases', 'product', 'products', 'item', 'items'],
  },
];

const PENDING_WORDS = [
  'pending', 'left', 'remaining', 'remain', 'still', 'yet', 'unplayed', 'unwatched',
  'upcoming', 'outstanding', 'waiting', 'todo',
];
const DONE_WORDS = ['already', 'finished', 'completed', 'complete', 'done', 'played', 'watched', 'bought'];
/** A question about money is about amounts, not about a list of names. */
const MONEY_WORDS = ['spend', 'spent', 'cost', 'costs', 'much', 'money', 'total', 'price', 'paid', 'budget'];

const LIST_NOUN: Partial<Record<MemoryType, { one: string; many: string; list: string }>> = {
  play: { one: 'game', many: 'games', list: 'playlist' },
  watch: { one: 'thing to watch', many: 'things to watch', list: 'watchlist' },
  wish: { one: 'thing to buy', many: 'things to buy', list: 'wishlist' },
};

const words = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

/**
 * Is this a plain question about one of the three lists?
 *
 * Deliberately narrow. Anything with money in it, or a named period
 * ("last month"), belongs to the model: those need adding up or filtering by
 * date, which is the model's job, not this one's.
 *
 * @param dated whether the question names a period, from guessDateRange
 */
export function listQuestion(question: string, dated = false): ListQuestion | null {
  if (dated) return null;

  const said = words(question);
  const has = (list: string[]) => list.some((word) => said.includes(word));
  if (has(MONEY_WORDS)) return null;

  const match = TYPE_WORDS.find((candidate) => has(candidate.words));
  if (!match) return null;

  const named = said.some((word) => ['playlist', 'watchlist', 'wishlist'].includes(word));
  if (has(PENDING_WORDS)) return { type: match.type, state: 'pending' };
  if (has(DONE_WORDS)) return { type: match.type, state: 'done' };
  // "What is on my watchlist" means what is still on it.
  if (named) return { type: match.type, state: 'pending' };
  return null;
}

export interface ListAnswer {
  headline: string;
  answer: string;
  items: string[];
  entries: Memory[];
}

/** The matching entries, newest first, with the lines to show for them. */
export function answerFromList(question: ListQuestion, all: Memory[]): ListAnswer {
  const noun = LIST_NOUN[question.type] ?? { one: 'entry', many: 'entries', list: 'list' };

  const entries = all
    .filter((memory) => memory.type === question.type)
    .filter((memory) =>
      question.state === 'all'
        ? true
        : question.state === 'pending'
          ? memory.status === 'active'
          : memory.status !== 'active'
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const count = entries.length;
  const things = count === 1 ? noun.one : noun.many;

  const answer =
    count === 0
      ? question.state === 'done'
        ? `Nothing on your ${noun.list} is finished yet.`
        : `Your ${noun.list} is empty.`
      : question.state === 'done'
        ? `You have finished ${count} ${things}.`
        : `You have ${count} ${things} still on your ${noun.list}.`;

  return {
    headline: count === 0 ? 'None' : `${count} ${things}`,
    answer,
    items: entries.map((memory) => `${fullDateLabel(memory.createdAt)} · ${memory.title}`),
    entries,
  };
}
