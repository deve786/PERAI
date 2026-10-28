/**
 * The arithmetic behind the charts, kept apart from drawing them.
 *
 * Every function here is pure and imports nothing from React Native, so the
 * numbers a chart shows are unit tested in plain Node (scripts/test-logic.ts)
 * rather than eyeballed on a phone.
 */

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const value = parseInt(full, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** `fg` laid over `bg` at `alpha`, as an opaque hex — the colour the eye actually sees. */
export function blend(fg: string, bg: string, alpha: number): string {
  const [r1, g1, b1] = hexToRgb(fg);
  const [r2, g2, b2] = hexToRgb(bg);
  const mix = (a: number, b: number) => Math.round(a * alpha + b * (1 - alpha));
  return `#${[mix(r1, r2), mix(g1, g2), mix(b1, b2)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The heatmap's four steps of one hue, light to dark, plus the empty cell.
 *
 * Sequential data takes one hue that only gets darker; a rainbow would make
 * the reader learn a colour order to read an amount. The steps are the accent
 * laid over the card at rising strength, so they belong to the palette in
 * both light and dark mode rather than being a second set of colours.
 *
 * Checked with the dataviz skill's validator in --ordinal mode against both
 * card colours. The palest step starts at 45%: at 22% it sat at 1.4:1 against
 * the card, under the 2:1 floor, and read as an empty day. These steps pass
 * every check in both modes (light end 2.14:1 light, 2.07:1 dark; one hue;
 * every adjacent step at least 0.06 apart in lightness).
 */
export const HEAT_ALPHAS = [0.45, 0.63, 0.82, 1] as const;

export function heatRamp(accent: string, surface: string): string[] {
  return HEAT_ALPHAS.map((alpha) => blend(accent, surface, alpha));
}

// ---------------------------------------------------------------------------
// Calendar heatmap
// ---------------------------------------------------------------------------

/**
 * Which of the four steps each value falls in, 0 for nothing at all.
 *
 * Steps are cut at the quartiles of the days that had something, not at even
 * fractions of the largest day. One big day — a flight, a rent payment —
 * would otherwise push every ordinary day into the palest step, and the whole
 * calendar would read as "nothing happened" around one dark square.
 */
export function heatLevels(values: number[]): number[] {
  const active = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (active.length === 0) return values.map(() => 0);

  const at = (q: number) => active[Math.min(active.length - 1, Math.floor(q * active.length))];
  const cuts = [at(0.25), at(0.5), at(0.75)];
  const busiest = active[active.length - 1];

  return values.map((v) => {
    if (v <= 0) return 0;
    // The busiest day is always the darkest. With few active days the
    // quartiles collapse onto one value, and a lone busy day would otherwise
    // be drawn in the palest step — read as "barely anything".
    if (v >= busiest) return 4;
    if (v <= cuts[0]) return 1;
    if (v <= cuts[1]) return 2;
    if (v <= cuts[2]) return 3;
    return 4;
  });
}

export interface HeatCell {
  date: string; // YYYY-MM-DD
  value: number;
  count: number;
  level: number; // 0..4
  /** Outside the period asked for — drawn as a blank so the grid stays aligned. */
  outside: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/**
 * Lay the period out in Monday-first weeks: one array per week, seven cells
 * each. Days before `from` in the first week and after `to` in the last are
 * marked outside, so every column is a weekday.
 */
export function heatWeeks(
  from: string,
  to: string,
  totals: Map<string, { value: number; count: number }>
): HeatCell[][] {
  const start = fromKey(from);
  const end = fromKey(to);
  if (end < start) return [];

  // Back to the Monday on or before `from`.
  const first = new Date(start);
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7));

  const cells: HeatCell[] = [];
  for (const d = new Date(first); ; d.setDate(d.getDate() + 1)) {
    const key = toKey(d);
    const inside = d >= start && d <= end;
    const entry = totals.get(key);
    cells.push({
      date: key,
      value: inside ? entry?.value ?? 0 : 0,
      count: inside ? entry?.count ?? 0 : 0,
      level: 0,
      outside: !inside,
    });
    // Stop at the end of the week that holds `to`.
    if (d >= end && (d.getDay() + 6) % 7 === 6) break;
  }

  const levels = heatLevels(cells.map((cell) => (cell.outside ? 0 : cell.value)));
  cells.forEach((cell, i) => {
    cell.level = levels[i];
  });

  const weeks: HeatCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// ---------------------------------------------------------------------------
// Waterfall: income, stepped down by each category, to what was left
// ---------------------------------------------------------------------------

export interface WaterfallStep {
  label: string;
  kind: 'start' | 'down' | 'end';
  /** Where the bar starts and ends on the money axis. */
  from: number;
  to: number;
  /** The figure written beside it: the step's own size, or the total for start/end. */
  amount: number;
}

/**
 * Income at the top, each category taking its bite, and what was left at the
 * bottom. The six largest categories get a step each; the rest fold into
 * "Everything else", because a seventh step of ₹40 tells nobody anything and
 * costs a row.
 */
export function waterfallSteps(
  income: number,
  categories: { name: string; total: number }[],
  maxSteps = 6
): WaterfallStep[] {
  const sorted = [...categories].filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
  const shown = sorted.slice(0, maxSteps);
  const rest = sorted.slice(maxSteps).reduce((sum, c) => sum + c.total, 0);
  if (rest > 0) shown.push({ name: 'Everything else', total: rest });

  const steps: WaterfallStep[] = [{ label: 'Income', kind: 'start', from: 0, to: income, amount: income }];
  let level = income;
  for (const category of shown) {
    steps.push({ label: category.name, kind: 'down', from: level, to: level - category.total, amount: category.total });
    level -= category.total;
  }
  steps.push({ label: level >= 0 ? 'Left over' : 'Overspent', kind: 'end', from: 0, to: level, amount: level });
  return steps;
}

/** The axis a waterfall needs: from its lowest point (or zero) to its highest. */
export function waterfallDomain(steps: WaterfallStep[]): [number, number] {
  let low = 0;
  let high = 0;
  for (const step of steps) {
    low = Math.min(low, step.from, step.to);
    high = Math.max(high, step.from, step.to);
  }
  return [low, high === low ? low + 1 : high];
}

// ---------------------------------------------------------------------------
// Comparison against a previous period
// ---------------------------------------------------------------------------

export interface Delta {
  /** Whole-number percentage change, or null when there is nothing to compare with. */
  pct: number | null;
  direction: 'up' | 'down' | 'flat';
  /** Whether the change is a good one, given which way is good for this figure. */
  good: boolean | null;
}

/**
 * The change from one period to the next, and whether it is good news.
 *
 * Up is not always good: more income is, more spending is not. The caller
 * says which way is good; the colour that shows the change comes from that,
 * never from the direction alone.
 */
export function delta(current: number, previous: number, upIsGood: boolean): Delta {
  if (!Number.isFinite(previous) || previous === 0) {
    return { pct: null, direction: current > 0 ? 'up' : 'flat', good: null };
  }
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100);
  const direction = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  const good = direction === 'flat' ? null : (direction === 'up') === upIsGood;
  return { pct, direction, good };
}

// ---------------------------------------------------------------------------
// Budget pace
// ---------------------------------------------------------------------------

export interface Pace {
  /** Share of the budget spent. */
  used: number;
  /** Share of the month gone — where spending would be if it ran evenly. */
  expected: number;
  daysLeft: number;
  /** Spent beyond what an even pace would have spent by now; negative when behind it. */
  aheadBy: number;
  /** What can still be spent per day for the rest of the month to land on budget. */
  perDayLeft: number;
}

/**
 * Where spending stands against where an even pace would have it by today.
 *
 * "68% used" alone cannot be read as good or bad: on the 25th it is fine, on
 * the 10th it is a problem. Set against the share of the month gone, it can.
 */
export function budgetPace(spent: number, budget: number, dayOfMonth: number, daysInMonth: number): Pace {
  const used = budget > 0 ? spent / budget : 0;
  const expected = daysInMonth > 0 ? dayOfMonth / daysInMonth : 0;
  const daysLeft = Math.max(0, daysInMonth - dayOfMonth);
  const aheadBy = spent - budget * expected;
  const perDayLeft = daysLeft > 0 ? Math.max(0, budget - spent) / daysLeft : 0;
  return { used, expected, daysLeft, aheadBy, perDayLeft };
}

// ---------------------------------------------------------------------------
// Sparklines
// ---------------------------------------------------------------------------

/**
 * One total per month, oldest first, for the last `months` months ending with
 * the month of `today` — zeros included, so a quiet month is a dip in the
 * line rather than a gap that joins its neighbours.
 */
export function monthlyTotals(
  rows: { date: string; value: number }[],
  today: string,
  months = 6
): number[] {
  const end = fromKey(today);
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  }
  const totals = new Map(keys.map((key) => [key, 0]));
  for (const row of rows) {
    const key = row.date.slice(0, 7);
    if (totals.has(key)) totals.set(key, (totals.get(key) ?? 0) + row.value);
  }
  return keys.map((key) => totals.get(key) ?? 0);
}

/** Points for a sparkline path inside a `width` × `height` box, with `inset` kept clear for the end dot. */
export function sparkPoints(values: number[], width: number, height: number, inset = 3): [number, number][] {
  if (values.length === 0) return [];
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = values.length > 1 ? (width - inset * 2) / (values.length - 1) : 0;
  return values.map((v, i) => [
    inset + i * step,
    inset + (height - inset * 2) * (1 - (v - min) / span),
  ]);
}

// ---------------------------------------------------------------------------
// Naming a bucket of a trend
// ---------------------------------------------------------------------------

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * The axis label for a bucket, as stats.trend() and insights.bucket() make
 * them: a day's bucket is labelled with its day number, a week's with "W3",
 * and a month's with its two-digit month.
 */
export function bucketTick(bucket: { date: string; label: string }): string {
  const [y, m, d] = bucket.date.split('-');
  const month = MONTH_SHORT[Number(m) - 1] ?? '';
  if (bucket.label === m) return `${month} ${y}`;
  return `${Number(d)} ${month}`;
}

/** The fuller name for a bucket in a callout: "Fri 16 Oct", "Week of 5 Oct", "Oct 2026". */
export function bucketName(bucket: { date: string; label: string }): string {
  const [y, m, d] = bucket.date.split('-').map(Number);
  const month = MONTH_SHORT[m - 1] ?? '';
  if (bucket.label === String(m).padStart(2, '0')) return `${month} ${y}`;
  if (/^W\d+$/.test(bucket.label)) return `Week of ${d} ${month}`;
  return `${DAY_SHORT[new Date(y, m - 1, d).getDay()]} ${d} ${month}`;
}

// ---------------------------------------------------------------------------
// Bars inside an answer
// ---------------------------------------------------------------------------

/**
 * Read a figure as the model wrote it — "₹1,825.00", "₹4,300", "3 days" —
 * into a number, or null when it is not a money figure. Only money gets a
 * bar: a bar under "3 days" beside one under "₹1,825" would compare things
 * that share no scale.
 */
export function parseMoney(text: string | null): number | null {
  if (!text) return null;
  const match = text.replace(/\s/g, '').match(/^(?:[₹$€£]|rs\.?|inr)?(-?[\d,]+(?:\.\d+)?)$/i);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

/**
 * A bar length for each row, as a share of the largest, on one scale across
 * the whole answer — so Minicoy's tickets and Agatti's can be compared by eye,
 * not only within their own group. Null for a row with no money figure.
 *
 * Bars are only drawn when at least two rows carry money: a single bar
 * compares nothing.
 */
export function answerBarShares(amounts: (string | null)[]): (number | null)[] | null {
  const values = amounts.map(parseMoney);
  const real = values.filter((v): v is number => v !== null && v > 0);
  if (real.length < 2) return null;
  const max = Math.max(...real);
  return values.map((v) => (v !== null && v > 0 ? v / max : null));
}
