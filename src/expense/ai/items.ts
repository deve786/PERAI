import { ASK_MODEL, describeError, hasApiKey, requestText } from './client';
import { addAiLog } from './logger';

export interface ItemGuessOptions {
  title: string;
  category?: string;
  itemCount: number;
  existingNames?: string[];
}

/**
 * Uses Gemini to extract clean item names strictly based on the expense title.
 * NEVER invents or hallucinates random items.
 * If the user has already filled any item name, they are replaced with names directly from the title.
 */
export async function guessItemNamesWithAI(options: ItemGuessOptions): Promise<string[] | null> {
  const title = options.title.trim();
  if (!hasApiKey() || !title) return null;

  const count = Math.max(1, options.itemCount);
  const prompt = `Expense title: "${title}"
Number of items requested: ${count}
Existing item names: ${JSON.stringify(options.existingNames || [])}

Instructions:
Extract and name the split expense items strictly based on the expense title "${title}".
1. If the expense title lists or contains multiple items (e.g. "Burger and Fries", "Milk, Bread, Eggs", "Movie ticket and popcorn"), extract those specific items from the title.
2. If the expense title represents a single purchase (e.g. "Coffee", "Dinner at Taj", "Nike Shoes", "Groceries"), use the title of the expense itself (Title Case, cleaned up) for the item name.
3. If the user already filled in any item names, replace them with the items derived from the title "${title}".
4. CRITICAL RULE: DO NOT INVENT OR HALLUCINATE RANDOM ITEMS. Every single item name must be derived directly from the title "${title}". Never make up items that were not specified.

Return ONLY a raw JSON array of strings containing the item names, like:
["Item Name 1"]
No markdown formatting, no backticks, no other text.`;

  try {
    const raw = await requestText({
      model: ASK_MODEL,
      system: 'You are an expense itemizer. Return only a raw JSON array of strings derived strictly from the expense title. Never invent random items.',
      user: prompt,
      retries: 0,
    });

    const clean = raw.replace(/```json|```/gi, '').trim();
    const arrayMatch = clean.match(/\[[\s\S]*\]/);
    if (!arrayMatch) throw new Error('AI response was not a valid JSON array');

    const parsed = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty array returned');

    const names = parsed.map((it) => String(it || '').trim()).filter(Boolean);
    if (names.length === 0) return null;

    addAiLog({
      type: 'categorize',
      title: `Split Items: "${title}"`,
      status: 'success',
      result: names.join(', '),
      model: ASK_MODEL,
    });

    return names;
  } catch (err) {
    const errDesc = describeError(err);
    addAiLog({
      type: 'categorize',
      title: `Split Items: "${title}"`,
      status: 'error',
      error: errDesc,
      model: ASK_MODEL,
    });
    return null;
  }
}
