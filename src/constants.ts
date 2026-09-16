export const DEFAULT_CURRENCY = 'INR';

/** Rendered in front of an amount; falls back to the raw code. */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  AED: 'AED ',
};

// Colour-coded category icons were removed in the minimalist pass: the filter
// chips already let you narrow by category, so in the record itself the
// category is a small typographic stamp rather than a coloured tile. Palette
// and type tokens now live in theme.ts.
