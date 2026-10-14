import { ASK_MODEL, describeError, hasApiKey, requestText } from './client';
import { addAiLog } from './logger';

export interface TitleGenerationOptions {
  items?: { name: string; qty?: string; amount?: string }[];
  category?: string;
  notes?: string;
  amount?: string | number;
  userTag?: string;
  currentTitle?: string;
}

/**
 * Uses Gemini to generate a concise, natural expense title (2-4 words, Title Case).
 * Summarizes split item names, category, notes, or purchase context.
 */
export async function generateExpenseTitleWithAI(options: TitleGenerationOptions): Promise<string | null> {
  if (!hasApiKey()) {
    addAiLog({
      type: 'categorize',
      title: 'Generate Title',
      status: 'error',
      error: 'No Gemini API key configured.',
      model: ASK_MODEL,
    });
    return null;
  }

  const validItems = (options.items || [])
    .map((it) => it.name.trim())
    .filter(Boolean);

  const promptDetails: string[] = [];
  if (validItems.length > 0) {
    promptDetails.push(`Split Items: ${validItems.join(', ')}`);
  }
  if (options.category && options.category !== 'Other') {
    promptDetails.push(`Category: ${options.category}`);
  }
  if (options.amount && Number(options.amount) > 0) {
    promptDetails.push(`Total Amount: ${options.amount}`);
  }
  if (options.userTag && options.userTag.trim()) {
    promptDetails.push(`For User/Person: ${options.userTag.trim()}`);
  }
  if (options.notes && options.notes.trim()) {
    promptDetails.push(`Notes: ${options.notes.trim()}`);
  }
  if (options.currentTitle && options.currentTitle.trim()) {
    promptDetails.push(`Existing Title: ${options.currentTitle.trim()}`);
  }

  if (promptDetails.length === 0) {
    return null;
  }

  const userPrompt = `Generate a short, natural, and descriptive expense title based on the following details:
${promptDetails.join('\n')}

Rules:
1. Return ONLY the title itself (2 to 4 words max, Title Case, e.g. "Grocery Shopping", "Pizza Dinner", "Office Supplies", "Uber Ride", "Coffee with Sarah", "Flight Tickets").
2. No punctuation, no quotes, no markdown, no explanation.
3. If split items are provided, make the title reflect or summarize those items (e.g., if items are "Burger", "French Fries", title should be "Burger & Fries" or "Fast Food Lunch").`;

  try {
    const raw = await requestText({
      model: ASK_MODEL,
      system: 'You generate short, clean expense titles (2-4 words, Title Case). Reply with only the title, nothing else.',
      user: userPrompt,
      retries: 0,
    });

    const clean = raw.trim().replace(/^["'.`]+|["'.`]+$/g, '').trim();
    if (!clean) return null;

    addAiLog({
      type: 'categorize',
      title: `Generate Title (${validItems.length > 0 ? validItems.join(', ') : options.category || 'Expense'})`,
      status: 'success',
      result: clean,
      model: ASK_MODEL,
    });

    return clean;
  } catch (err) {
    const errDesc = describeError(err);
    addAiLog({
      type: 'categorize',
      title: 'Generate Title',
      status: 'error',
      error: errDesc,
      model: ASK_MODEL,
    });
    return null;
  }
}
