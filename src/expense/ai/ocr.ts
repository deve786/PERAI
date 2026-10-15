import { GoogleGenAI } from '@google/genai';
import { getApiKey, hasApiKey, MissingApiKeyError } from './client';
import { addAiLog } from './logger';
import { todayStr } from '../dates';

export interface ScannedItem {
  name: string;
  quantity: number;
  amount: number;
}

export interface ScannedReceipt {
  merchant: string;
  totalAmount: number;
  date: string; // YYYY-MM-DD
  category: string;
  items: ScannedItem[];
}

const OCR_MODEL = process.env.EXPO_PUBLIC_GEMINI_OCR_MODEL || 'gemini-3.5-flash-lite';

const OCR_SYSTEM_PROMPT = `You are an expert receipt and invoice analyzer.
Analyze the provided image of a receipt, bill, or invoice and extract structured financial data accurately.
Never invent items or numbers that do not appear in the image.
If an item name is truncated or unclear, use the best visible text.
Categories must be strictly one of: Food, Transport, Shopping, Bills, Rent, Health, Entertainment, Other.`;

const OCR_USER_PROMPT = `Extract the following details from this receipt/bill image:
1. merchant: The store, restaurant, vendor, or biller name.
2. totalAmount: The final total amount charged (number).
3. date: The transaction date in YYYY-MM-DD format (or null if not visible).
4. category: Exactly one of: Food, Transport, Shopping, Bills, Rent, Health, Entertainment, Other.
5. items: Array of line items purchased, each with:
   - "name": clean item description (string)
   - "quantity": item count/quantity (number, default 1)
   - "amount": line total price for this item (number)

Return ONLY a raw JSON object with this exact structure:
{
  "merchant": "Store Name",
  "totalAmount": 120.50,
  "date": "2026-10-15",
  "category": "Food",
  "items": [
    { "name": "Item Name", "quantity": 1, "amount": 120.50 }
  ]
}
No markdown backticks, no prose.`;

function extractJson(raw: string): unknown {
  const text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const target = fenced ? fenced[1].trim() : text;

  const start = target.indexOf('{');
  const end = target.lastIndexOf('}');
  if (start !== -1 && end > start) {
    return JSON.parse(target.slice(start, end + 1));
  }
  return JSON.parse(target);
}

const VALID_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Bills', 'Rent', 'Health', 'Entertainment', 'Other'];

/**
 * Sends a base64 encoded image of a receipt or invoice to Gemini to perform OCR.
 * Returns structured merchant, amount, category, date, and line items.
 */
export async function scanReceiptWithAI(imageBase64: string, mimeType = 'image/jpeg'): Promise<ScannedReceipt> {
  if (!hasApiKey()) {
    throw new MissingApiKeyError();
  }

  const client = new GoogleGenAI({ apiKey: getApiKey() });
  const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

  let rawOutput = '';

  try {
    // Try models.generateContent with inlineData first
    const response = await client.models.generateContent({
      model: OCR_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: `${OCR_SYSTEM_PROMPT}\n\n${OCR_USER_PROMPT}` },
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
          ],
        },
      ],
    });

    rawOutput = response.text || '';
  } catch (primaryErr) {
    // Fallback to interactions.create with image input
    try {
      const interaction = await client.interactions.create({
        model: OCR_MODEL,
        system_instruction: OCR_SYSTEM_PROMPT,
        input: [
          { type: 'text', text: OCR_USER_PROMPT },
          { type: 'image', data: cleanBase64, mime_type: mimeType },
        ],
      } as Parameters<GoogleGenAI['interactions']['create']>[0]);

      rawOutput = (interaction as { output_text?: string })?.output_text || '';
    } catch {
      throw primaryErr;
    }
  }

  if (!rawOutput) {
    throw new Error('Gemini returned an empty response for this receipt image.');
  }

  const parsed = extractJson(rawOutput) as Record<string, unknown>;

  const merchant = typeof parsed.merchant === 'string' && parsed.merchant.trim()
    ? parsed.merchant.trim()
    : 'Receipt';

  let totalAmount = typeof parsed.totalAmount === 'number' && Number.isFinite(parsed.totalAmount)
    ? parsed.totalAmount
    : parseFloat(String(parsed.totalAmount ?? '0')) || 0;

  let date = typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
    ? parsed.date
    : todayStr();

  let category = typeof parsed.category === 'string' && VALID_CATEGORIES.includes(parsed.category)
    ? parsed.category
    : 'Shopping';

  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  const items: ScannedItem[] = [];

  for (const it of rawItems) {
    if (typeof it === 'object' && it !== null) {
      const itemObj = it as Record<string, unknown>;
      const name = String(itemObj.name ?? '').trim();
      const quantity = Math.max(1, parseFloat(String(itemObj.quantity ?? '1')) || 1);
      const amount = parseFloat(String(itemObj.amount ?? '0')) || 0;
      if (name && amount > 0) {
        items.push({ name, quantity, amount });
      }
    }
  }

  // If totalAmount was not found but line items exist, sum them up
  if (totalAmount <= 0 && items.length > 0) {
    totalAmount = items.reduce((acc, it) => acc + (it.amount * (it.quantity || 1)), 0);
  }

  addAiLog({
    type: 'categorize',
    title: `Receipt OCR: "${merchant}" (${totalAmount})`,
    status: 'success',
    result: `${items.length} items parsed`,
    model: OCR_MODEL,
  });

  return {
    merchant,
    totalAmount: Math.round(totalAmount * 100) / 100,
    date,
    category,
    items,
  };
}
