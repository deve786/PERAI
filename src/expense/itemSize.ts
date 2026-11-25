/** What an item's size is measured in. */
export const SIZE_UNITS = ['kg', 'g', 'L', 'ml', 'pcs'] as const;
export type SizeUnit = (typeof SIZE_UNITS)[number];

/** 1.5 → "1.5", 2 → "2", 0.3333 → "0.333". */
const num = (n: number) => String(Math.round(n * 1000) / 1000);

/** Whether `unit` is one we know how to show. */
export function isSizeUnit(unit: string | null | undefined): unit is SizeUnit {
  return !!unit && (SIZE_UNITS as readonly string[]).includes(unit);
}

/** "1 kg", "500 g" — one pack's size. Empty when no size was given. */
export function sizeLabel(weight: number | null | undefined, unit: string | null | undefined): string {
  if (!weight || weight <= 0 || !isSizeUnit(unit)) return '';
  return `${num(weight)} ${unit}`;
}

/** The whole lot in the friendliest unit: 3 × 500 g → 1.5 kg, 4 × 250 ml → 1 L. */
export function totalSize(quantity: number, weight: number, unit: SizeUnit): { weight: number; unit: SizeUnit } {
  const total = quantity * weight;
  if (unit === 'g' && total >= 1000) return { weight: total / 1000, unit: 'kg' };
  if (unit === 'ml' && total >= 1000) return { weight: total / 1000, unit: 'L' };
  return { weight: total, unit };
}

/**
 * How an item reads on the details page:
 *   1 pack of 1 kg  → "1 kg"
 *   2 packs of 1 kg → "2 × 1 kg = 2 kg"
 * Empty when the item has no size.
 */
export function itemSizeText(quantity: number, weight: number | null | undefined, unit: string | null | undefined): string {
  const one = sizeLabel(weight, unit);
  if (!one || !weight || !isSizeUnit(unit)) return '';
  if (quantity === 1) return one;
  const total = totalSize(quantity, weight, unit);
  return `${num(quantity)} × ${one} = ${num(total.weight)} ${total.unit}`;
}

/**
 * Price for one kg / litre / piece, from what one pack costs:
 * ₹450 for a 1 kg pack → "₹450 per kg"; ₹60 for 250 g → "₹240 per kg".
 * Empty when there's no size or no price.
 */
export function pricePerUnitText(pricePerPack: number, weight: number | null | undefined, unit: string | null | undefined, symbol = '₹'): string {
  if (!weight || weight <= 0 || !isSizeUnit(unit) || !(pricePerPack > 0)) return '';
  const base: Record<SizeUnit, { factor: number; per: string }> = {
    kg: { factor: 1, per: 'kg' }, g: { factor: 1000, per: 'kg' },
    L: { factor: 1, per: 'L' }, ml: { factor: 1000, per: 'L' }, pcs: { factor: 1, per: 'pc' },
  };
  const { factor, per } = base[unit];
  const price = Math.round((pricePerPack / weight) * factor * 100) / 100;
  return `${symbol}${price % 1 === 0 ? price : price.toFixed(2)} per ${per}`;
}
