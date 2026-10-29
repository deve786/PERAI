import { mapToExpenseCategory } from './categoryMapping';
import { todayStr } from './dates';
import type { ScannedPayment } from './ai/ocr';

/**
 * Pure on-device heuristic & regex extractor for UPI payment confirmations,
 * bank SMS notifications, and shared payment text.
 *
 * Runs 100% offline with 0 network calls. Used when offline or when Gemini AI
 * is unreachable.
 */
export function extractPaymentFromTextOffline(
  text: string,
  categoryNames: string[] = []
): ScannedPayment {
  const clean = text.trim();
  if (!clean) {
    return { amount: 0, payee: null, date: null, bank: null, category: null };
  }

  // 1. Amount Extraction
  // Handles:
  // - "₹500", "₹ 1,200.50", "Rs. 450", "Rs 450", "INR 750"
  // - "debited by Rs 500", "debited for INR 1,200", "paid ₹350"
  // - "payment of ₹450", "500 paid to"
  let amount = 0;
  const amountPatterns = [
    /(?:(?:rs\.?|inr|₹)\s*|\bdebited\s+(?:by|for|with)\s*(?:rs\.?|inr|₹)?\s*|\bpaid\s*(?:rs\.?|inr|₹)?\s*|\bsent\s*(?:rs\.?|inr|₹)?\s*|\bpayment\s+of\s*(?:rs\.?|inr|₹)?\s*)([\d,]+(?:\.\d{1,2})?)/i,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:rs|rupees|inr|₹)/i,
    /(?:amount|amt)[:\s]*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  ];

  for (const pat of amountPatterns) {
    const m = clean.match(pat);
    if (m && m[1]) {
      const num = parseFloat(m[1].replace(/,/g, ''));
      if (Number.isFinite(num) && num > 0) {
        amount = Math.round(num * 100) / 100;
        break;
      }
    }
  }

  // 2. Payee Extraction
  // Handles:
  // - "Paid to Ramesh Kumar using Google Pay"
  // - "Sent to Chai Point"
  // - "transfer to SWIGGY Ref No..."
  // - "towards BESCOM"
  // - "info: UPI/123456/Zomato"
  let payee: string | null = null;
  const payeePatterns = [
    /(?:paid\s+to|sent\s+to|transfer\s+to|transferred\s+to|towards|to\s+vpa|to)\s+[:\s]*([A-Za-z0-9\s&.'@-]+?)(?:\s+(?:on|via|using|from|with|ref|upi|txn|a\/c|acct|ac|dated|balance|bal|completed|successful)|\.|\n|$)/i,
    /info:\s*upi\/[^\/]+\/([A-Za-z0-9\s&.'-]+)/i,
    /upi\/([A-Za-z0-9\s&.'-]+)/i,
  ];

  for (const pat of payeePatterns) {
    const m = clean.match(pat);
    if (m && m[1]) {
      let candidate = m[1].trim();
      // Remove trailing noise words
      candidate = candidate.replace(/\s+(?:using|via|on|ref|upi|google\s+pay|phonepe|paytm|successful|completed|was).*$/i, '').trim();
      // Exclude trivial filler strings
      if (candidate.length > 1 && !/^(a\/c|account|bank|upi|rs|inr|money|\d+)$/i.test(candidate)) {
        payee = candidate;
        break;
      }
    }
  }

  // 3. Bank Extraction
  // Recognizes common Indian banks and account ending numbers
  let bank: string | null = null;
  const bankPatterns = [
    /\b(state bank of india|sbi)\b/i,
    /\b(hdfc bank|hdfc)\b/i,
    /\b(icici bank|icici)\b/i,
    /\b(axis bank|axis)\b/i,
    /\b(kotak mahindra bank|kotak)\b/i,
    /\b(bank of baroda|bob)\b/i,
    /\b(punjab national bank|pnb)\b/i,
    /\b(canara bank|canara)\b/i,
    /\b(union bank of india|union bank|ubi)\b/i,
    /\b(bank of india|boi)\b/i,
    /\b(central bank of india|cbi)\b/i,
    /\b(indusind bank|indusind)\b/i,
    /\b(federal bank)\b/i,
    /\b(paytm payments bank|paytm bank)\b/i,
    /\b(airtel payments bank)\b/i,
  ];

  for (const pat of bankPatterns) {
    const m = clean.match(pat);
    if (m) {
      bank = m[0].trim();
      break;
    }
  }

  // Look for account digits: e.g. "A/c ending 1234", "A/c XX5678", "ending 1234", "ends in 9012"
  const acctMatch = clean.match(/(?:a\/c|acct|account|ending|ends\s+in|card)\s*(?:ending\s+)?[:\s]*[*xX•\d\s]{2,16}/i);
  if (acctMatch) {
    const digits = acctMatch[0].replace(/\D+/g, '');
    if (digits.length >= 3) {
      const last = digits.slice(-4);
      bank = bank ? `${bank} ••${last}` : `••${last}`;
    }
  }

  // 4. Date Extraction
  let date: string | null = null;
  const isoMatch = clean.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) {
    date = isoMatch[1];
  } else {
    // 20-Oct-2026, 20/10/2026, 20-Oct-26
    const dMatch = clean.match(/\b(\d{1,2})[-/\s]([A-Za-z]{3}|\d{1,2})[-/\s](\d{2,4})\b/);
    if (dMatch) {
      const day = dMatch[1].padStart(2, '0');
      let month = dMatch[2];
      let year = dMatch[3];
      if (year.length === 2) year = `20${year}`;
      const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const mIdx = months.indexOf(month.toLowerCase().slice(0, 3));
      if (mIdx !== -1) {
        month = String(mIdx + 1).padStart(2, '0');
        date = `${year}-${month}-${day}`;
      } else if (/^\d{1,2}$/.test(month)) {
        month = month.padStart(2, '0');
        date = `${year}-${month}-${day}`;
      }
    }
  }
  if (!date || isNaN(Date.parse(date))) {
    date = todayStr();
  }

  // 5. Category Selection
  let category: string | null = null;
  const guessed = mapToExpenseCategory(payee || clean);
  if (guessed && guessed !== 'Other') {
    const matched = categoryNames.find((c) => c.toLowerCase() === guessed.toLowerCase());
    category = matched ?? guessed;
  }

  return {
    amount,
    payee,
    date,
    bank,
    category,
  };
}
