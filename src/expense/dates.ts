export const pad = (n: number) => String(n).padStart(2, '0');

export function toStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function fromStr(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export const todayStr = () => toStr(new Date());
export const ymKey = (s: string) => s.slice(0, 7);

export function monthRange(year: number, month0: number) {
  const from = `${year}-${pad(month0 + 1)}-01`;
  const last = new Date(year, month0 + 1, 0).getDate();
  return { from, to: `${year}-${pad(month0 + 1)}-${pad(last)}` };
}

export function addDays(s: string, n: number) {
  const d = fromStr(s);
  d.setDate(d.getDate() + n);
  return toStr(d);
}

export function daysBetween(from: string, to: string) {
  return Math.round((fromStr(to).getTime() - fromStr(from).getTime()) / 86400000) + 1;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthName = (m0: number) => MONTHS[m0];

export function prettyDate(s: string) {
  const d = fromStr(s);
  const t = todayStr();
  if (s === t) return 'Today';
  if (s === addDays(t, -1)) return 'Yesterday';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`;
}

export function prettyRange(from: string, to: string) {
  const a = fromStr(from);
  const b = fromStr(to);
  return `${a.getDate()} ${MONTHS[a.getMonth()]} ${a.getFullYear()} – ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
}
