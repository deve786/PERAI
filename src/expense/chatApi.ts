import { getAllMemories } from '../db/queries';
import { renderMemory } from '../ai/ask';
import { ASK_MODEL, describeError, hasApiKey, requestText } from './ai/client';
import { buildChatContext } from './chatContext';

export type ChatMsg = { role: 'user' | 'assistant'; content: string };

export const chatConfigured = hasApiKey;

/** Most recent memories to include — same cap as recentExpenses, for the same reason: keep the prompt bounded. */
const MAX_PERAI_MEMORIES = 150;

const SYSTEM = `You are the assistant inside Spendly, a personal expense tracker app.
Answer questions using ONLY the data provided below: <expense_data> (this
person's spending/income) and <perai_memories> (their recorded voice notes —
life events, tasks, purchases, anything they captured outside this app).
These are two independent sources, not duplicates of each other — a spending
question may be answered from either or both, and a non-financial question
(an appointment, a task, a person, a place) likely only lives in the memories.

Rules:
- All totals in expense_data are already calculated. Quote them directly; do not re-add numbers yourself unless you must combine two or three values, and then double-check.
- "monthlySummaries" covers the last 12 months with per-category totals. "recentExpenses" lists individual items (latest first). If a question needs older line items than are available, say so.
- Use the currency symbol from the data. Format amounts like ₹1,250.
- Be concise: 1-4 short sentences, or a short list for breakdowns. No markdown headers.
- If neither source contains the answer, say so plainly. Never invent expenses or memories.
- Today's date is given in the data; use it to resolve "this month", "last week", etc.
- You can give brief, practical saving tips when asked, but stay grounded in the data.`;

/** Gemini takes one flattened turn, not a role-tagged history, so prior turns become text. */
function renderConversation(history: ChatMsg[]): string {
  const prior = history.slice(0, -1);
  if (prior.length === 0) return '';
  return ['CONVERSATION SO FAR:', ...prior.map((m) => `${m.role === 'user' ? 'Q' : 'A'}: ${m.content}`), ''].join('\n');
}

/** Rendered the same way PERAI's own Ask screen renders them, newest first. */
async function renderPeraiMemories(): Promise<string> {
  const all = await getAllMemories();
  const slice = all.slice(0, MAX_PERAI_MEMORIES);
  const rendered = slice.map((m, i) => renderMemory(m, `N${i + 1}`)).join('\n\n');
  const note =
    all.length > MAX_PERAI_MEMORIES
      ? `Only the latest ${MAX_PERAI_MEMORIES} of ${all.length} memories are listed.`
      : all.length === 0
        ? 'No memories are recorded.'
        : 'All memories are listed.';
  return [note, '', rendered].filter(Boolean).join('\n');
}

export async function askBot(history: ChatMsg[], currency: string, budget: number): Promise<string> {
  if (!hasApiKey()) throw new Error('Chatbot is not configured yet.');
  const question = history[history.length - 1]?.content ?? '';
  const [context, memories] = await Promise.all([
    buildChatContext(currency, budget),
    // PERAI's own data is a bonus, not a dependency — never let it block answering
    // from expense data alone (e.g. the memories table failing to open).
    renderPeraiMemories().catch(() => 'Not available.'),
  ]);
  // Keep only the last 10 turns to stay small and cheap.
  const recent = history.slice(-10);

  try {
    const reply = await requestText({
      model: ASK_MODEL,
      system: SYSTEM,
      user: [
        renderConversation(recent),
        `<expense_data>\n${JSON.stringify(context)}\n</expense_data>`,
        '',
        `<perai_memories>\n${memories}\n</perai_memories>`,
        '',
        `QUESTION: ${question}`,
      ]
        .filter(Boolean)
        .join('\n'),
    });
    return reply.trim() || 'Sorry, I could not come up with an answer.';
  } catch (err) {
    throw new Error(describeError(err));
  }
}
