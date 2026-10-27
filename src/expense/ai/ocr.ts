import { GoogleGenAI } from '@google/genai';
import { getApiKey, hasApiKey, MissingApiKeyError } from './client';
import { addAiLog } from './logger';
import { todayStr } from '../dates';
import { extractPaymentFromTextOffline } from '../paymentTextOffline';

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

export interface ScannedPayment {
  amount: number;
  /** Who it was paid to, exactly as shown. Null when no name is visible. */
  payee: string | null;
  /** YYYY-MM-DD, or null when no date is visible. */
  date: string | null;
  /** The bank/account line shown (e.g. "HDFC Bank ••1234"), or null when none is visible. */
  bank: string | null;
  /** One of the person's own category names, when asked for and something shown gives a clue. */
  category: string | null;
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

const PAYMENT_OCR_SYSTEM_PROMPT = `You read screenshots of a UPI payment confirmation, shared from an app like Google Pay, PhonePe or Paytm.
Extract only what is visible on the screen. Never invent an amount or a name that isn't shown.`;

const PAYMENT_OCR_USER_PROMPT = `Extract the following from this payment screenshot:
1. amount: the amount paid or sent, as a number (no currency symbol).
2. payee: who the money was paid to, exactly as shown (a person or business name), or null if no name is visible.
3. date: the transaction date in YYYY-MM-DD format, or null if not visible.
4. bank: the bank or account line shown for how it was paid (e.g. "HDFC Bank", "Kotak Mahindra Bank ••1234"), or null if none is visible.

Return ONLY a raw JSON object with this exact structure:
{
  "amount": 500,
  "payee": "Ramesh Kumar",
  "date": "2026-10-20",
  "bank": "HDFC Bank"
}
No markdown backticks, no prose. If this does not look like a payment confirmation at all, return {"amount": 0, "payee": null, "date": null, "bank": null}.`;

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
 * Sends one image to Gemini with a system/user prompt pair and returns its raw
 * text reply. Shared by every OCR-style call here — only the prompt and the
 * shape expected back differ between a receipt and a payment screenshot.
 */
async function callVisionModel(
  systemPrompt: string,
  userPrompt: string,
  imageBase64: string,
  mimeType: string
): Promise<string> {
  if (!hasApiKey()) {
    throw new MissingApiKeyError();
  }

  const client = new GoogleGenAI({ apiKey: getApiKey() });
  const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

  try {
    // Try models.generateContent with inlineData first
    const response = await client.models.generateContent({
      model: OCR_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: `${systemPrompt}\n\n${userPrompt}` },
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

    return response.text || '';
  } catch (primaryErr) {
    // Fallback to interactions.create with image input
    try {
      const interaction = await client.interactions.create({
        model: OCR_MODEL,
        system_instruction: systemPrompt,
        input: [
          { type: 'text', text: userPrompt },
          { type: 'image', data: cleanBase64, mime_type: mimeType },
        ],
      } as Parameters<GoogleGenAI['interactions']['create']>[0]);

      return (interaction as { output_text?: string })?.output_text || '';
    } catch {
      throw primaryErr;
    }
  }
}

/**
 * Sends a base64 encoded image of a receipt or invoice to Gemini to perform OCR.
 * Returns structured merchant, amount, category, date, and line items.
 */
export async function scanReceiptWithAI(imageBase64: string, mimeType = 'image/jpeg'): Promise<ScannedReceipt> {
  const rawOutput = await callVisionModel(OCR_SYSTEM_PROMPT, OCR_USER_PROMPT, imageBase64, mimeType);

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

/** Today's date (so a yearless date isn't guessed into the past), and a category from the person's own list — so a custom one like "Ticket" can be picked. */
function promptExtras(names: string[]): string {
  // The card often shows a date with no year; without today's date the
  // model fills one in from its own training and files the payment years back.
  const when = `\n\nToday is ${todayStr()}. If the date shown has no year, use the most recent such date on or before today.`;
  if (names.length === 0) return when;
  return `${when}\n\nAlso include "category": what this payment was most likely for, as exactly one of: ${names.join(', ')}. Go by the payee's name, the UPI ID and any note shown. Use null if nothing shown gives a reasonable clue.`;
}

function parsePayment(rawOutput: string, logLabel: string): ScannedPayment {
  const parsed = extractJson(rawOutput) as Record<string, unknown>;

  const amount = typeof parsed.amount === 'number' && Number.isFinite(parsed.amount)
    ? parsed.amount
    : parseFloat(String(parsed.amount ?? '0')) || 0;

  const payee = typeof parsed.payee === 'string' && parsed.payee.trim() ? parsed.payee.trim() : null;

  const date = typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
    ? parsed.date
    : null;

  const bank = typeof parsed.bank === 'string' && parsed.bank.trim() ? parsed.bank.trim() : null;
  const category =
    typeof parsed.category === 'string' && parsed.category.trim() ? parsed.category.trim() : null;

  addAiLog({
    type: 'categorize',
    title: `Payment ${logLabel}: ${payee ?? 'unknown payee'} (${amount})`,
    status: amount > 0 ? 'success' : 'error',
    result: amount > 0 ? 'parsed' : 'no payment detected',
    model: OCR_MODEL,
  });

  return { amount: Math.round(amount * 100) / 100, payee, date, bank, category };
}

/**
 * Sends a base64 encoded screenshot of a UPI payment confirmation to Gemini.
 * Unlike a shop receipt this has no line items — just an amount, who it went
 * to, and when — which is what GPay's own "Share" button sends instead of
 * plain text, so this is the path a shared payment image goes through.
 */
export async function scanPaymentWithAI(
  imageBase64: string,
  mimeType = 'image/jpeg',
  categoryNames: string[] = []
): Promise<ScannedPayment> {
  const rawOutput = await callVisionModel(
    PAYMENT_OCR_SYSTEM_PROMPT,
    PAYMENT_OCR_USER_PROMPT + promptExtras(categoryNames),
    imageBase64,
    mimeType
  );
  if (!rawOutput) {
    throw new Error('Gemini returned an empty response for this payment image.');
  }
  return parsePayment(rawOutput, 'OCR');
}

const PAYMENT_TEXT_SYSTEM_PROMPT = `You read shared text describing a UPI payment, from an app like Google Pay, PhonePe or Paytm.
Extract only what the text actually says. Never invent an amount or a name that isn't there.`;

const PAYMENT_TEXT_USER_PROMPT = `Extract the following from this shared text:
1. amount: the amount paid or sent, as a number (no currency symbol).
2. payee: who the money was paid to, exactly as shown (a person or business name), or null if no name is given.
3. date: the transaction date in YYYY-MM-DD format, or null if not stated.
4. bank: the bank or account mentioned for how it was paid, or null if none is mentioned.

Return ONLY a raw JSON object with this exact structure:
{
  "amount": 500,
  "payee": "Ramesh Kumar",
  "date": "2026-10-20",
  "bank": "HDFC Bank"
}
No markdown backticks, no prose. If this doesn't describe a payment at all, return {"amount": 0, "payee": null, "date": null, "bank": null}.`;

/** Text-only counterpart to scanPaymentWithAI, for a share that sends words instead of an image. */
export async function extractPaymentFromText(text: string, categoryNames: string[] = []): Promise<ScannedPayment> {
  if (hasApiKey()) {
    try {
      const client = new GoogleGenAI({ apiKey: getApiKey() });
      const response = await client.models.generateContent({
        model: OCR_MODEL,
        contents: [
          { role: 'user', parts: [{ text: `${PAYMENT_TEXT_SYSTEM_PROMPT}\n\n${PAYMENT_TEXT_USER_PROMPT}${promptExtras(categoryNames)}\n\nShared text:\n${text}` }] },
        ],
      });
      const rawOutput = response.text || '';
      if (rawOutput) {
        const parsed = parsePayment(rawOutput, 'text');
        if (parsed.amount > 0) return parsed;
      }
    } catch (err) {
      console.warn('[extractPaymentFromText] Online model unavailable, falling back to offline parser:', err);
    }
  }

  // Fallback to offline on-device parser
  return extractPaymentFromTextOffline(text, categoryNames);
}
