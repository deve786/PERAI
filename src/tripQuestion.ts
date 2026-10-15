/**
 * "How much did I spend on my Kozhikode trip?" — answered from the link table
 * rather than the model.
 *
 * The entry names itself, the link table holds the spending, and a SUM is a
 * SUM: there is nothing here a model does better, and it would take seconds
 * and quota to do it worse. Pure, so the matching is unit tested; the totals
 * come from src/expense/tripSpending.ts.
 */
import type { Memory } from './types';

const SPEND_WORDS = ['spend', 'spent', 'cost', 'costs', 'budget', 'expense', 'expenses', 'money'];

const words = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

/** Words too common to identify an entry by. */
const WEAK = new Set([
  'trip', 'the', 'my', 'our', 'a', 'to', 'on', 'in', 'for', 'during', 'how',
  'much', 'did', 'i', 'we', 'spend', 'spent', 'cost', 'costs', 'money', 'total',
  'was', 'is', 'of', 'at', 'and', 'all', 'it', 'that', 'this',
]);

/**
 * Which recorded entry a spending question is about, if any.
 *
 * Needs both halves: a question about money, and an entry nameable from the
 * words used. An entry is matched on the distinctive words of its title —
 * "Kozhikode" rather than "trip" — so "how much did I spend last month" does
 * not accidentally land on a trip that happens to be called "Last month trip".
 *
 * Only entries that cover a span are considered: a moment has no spending to
 * gather, and the Spending card never appears for one.
 */
export function tripSpendQuestion(question: string, memories: Memory[]): Memory | null {
  const asked = words(question);
  // "How much was the Goa weekend" never says spend, cost or money, and is
  // plainly about what it cost.
  const aboutMoney =
    asked.some((word) => SPEND_WORDS.includes(word)) ||
    asked.some((word, index) => word === 'much' && asked[index - 1] === 'how');
  if (!aboutMoney) return null;

  const spans = memories.filter((memory) => memory.endDate !== null && memory.status !== 'archived');

  let best: { memory: Memory; score: number } | null = null;
  for (const memory of spans) {
    const title = words(memory.title).filter((word) => !WEAK.has(word) && word.length > 2);
    if (title.length === 0) continue;

    const hits = title.filter((word) => asked.includes(word)).length;
    if (hits === 0) continue;

    // Prefer the entry whose name is most fully spoken, then the longer name,
    // so "Kozhikode trip" beats a bare "Kozhikode" when both are recorded.
    const score = hits / title.length + hits / 100;
    if (!best || score > best.score) best = { memory, score };
  }

  return best ? best.memory : null;
}
