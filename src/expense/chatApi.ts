import { ASK_MODEL, describeError, hasApiKey, requestText } from './ai/client';
import { buildChatContext } from './chatContext';

export type ChatMsg = { role: 'user' | 'assistant'; content: string };

export const chatConfigured = hasApiKey;

const SYSTEM = `You are the assistant inside Spendly, a personal expense tracker app.
Answer questions about the user's spending using ONLY the JSON data provided below.

Rules:
- All totals in the data are already calculated. Quote them directly; do not re-add numbers yourself unless you must combine two or three values, and then double-check.
- "monthlySummaries" covers the last 12 months with per-category totals. "recentExpenses" lists individual items (latest first). If a question needs older line items than are available, say so.
- Use the currency symbol from the data. Format amounts like ₹1,250.
- Be concise: 1-4 short sentences, or a short list for breakdowns. No markdown headers.
- If the data does not contain the answer, say so plainly. Never invent expenses.
- Today's date is given in the data; use it to resolve "this month", "last week", etc.
- You can give brief, practical saving tips when asked, but stay grounded in the data.`;

/** Gemini takes one flattened turn, not a role-tagged history, so prior turns become text. */
function renderConversation(history: ChatMsg[]): string {
  const prior = history.slice(0, -1);
  if (prior.length === 0) return '';
  return ['CONVERSATION SO FAR:', ...prior.map((m) => `${m.role === 'user' ? 'Q' : 'A'}: ${m.content}`), ''].join('\n');
}

export async function askBot(history: ChatMsg[], currency: string, budget: number): Promise<string> {
  if (!hasApiKey()) throw new Error('Chatbot is not configured yet.');
  const question = history[history.length - 1]?.content ?? '';
  const context = await buildChatContext(currency, budget);
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
