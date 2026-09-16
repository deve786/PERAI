/**
 * Offline checks for everything that does not need the Gemini API:
 * retrieval ranking, date-window parsing and timeline grouping.
 *
 *   npm run test:logic
 */
import {
  guessDateRange,
  selectRelevantMemories,
  tokenize,
} from '../src/ai/retrieval';
import {
  addedLabel,
  dayLabel,
  formatAmount,
  groupByDay,
  hasStatedTime,
  localTimestamp,
} from '../src/format';
import { reminderTime } from '../src/reminderTime';
import type { Memory } from '../src/types';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}`);
    if (detail !== undefined) console.log('        got:', detail);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

const NOW = new Date('2026-09-16T10:00:00+05:30');

let seq = 0;
function memory(partial: Partial<Memory> & { title: string; eventDate: string }): Memory {
  seq += 1;
  return {
    id: `id-${seq}`,
    rawInput: partial.title,
    type: 'memory',
    category: 'Other',
    dateExpression: null,
    createdAt: partial.eventDate,
    amount: null,
    currency: null,
    people: null,
    location: null,
    tags: null,
    priority: null,
    status: 'active',
    confirmed: true,
    ...partial,
  };
}

const CORPUS: Memory[] = [
  memory({
    title: 'Got a haircut',
    eventDate: '2026-09-16T12:00:00+05:30',
    category: 'Personal Care',
    tags: 'haircut,grooming',
  }),
  memory({
    title: 'Got a haircut',
    eventDate: '2026-07-20T12:00:00+05:30',
    category: 'Personal Care',
    tags: 'haircut',
  }),
  memory({
    title: 'Bought AirPods',
    eventDate: '2026-09-10T12:00:00+05:30',
    category: 'Shopping',
    type: 'purchase',
    amount: 18000,
    currency: 'INR',
    tags: 'electronics,audio',
  }),
  memory({
    title: 'Bought a laptop charger',
    eventDate: '2026-08-02T12:00:00+05:30',
    category: 'Shopping',
    type: 'purchase',
    amount: 2400,
    currency: 'INR',
    tags: 'electronics',
  }),
  memory({
    title: 'Trip to Kozhikode',
    eventDate: '2026-09-15T12:00:00+05:30',
    category: 'Travel',
    location: 'Kozhikode',
    tags: 'travel',
  }),
  memory({
    title: 'Gym session',
    eventDate: '2026-09-14T07:00:00+05:30',
    category: 'Fitness',
    tags: 'gym,workout',
  }),
];

section('tokenize');
check('drops stopwords and punctuation', JSON.stringify(tokenize('When did I last cut my hair?')) === '["cut","hair"]', tokenize('When did I last cut my hair?'));

section('guessDateRange');
check('detects "last month"', guessDateRange('what did I spend last month', NOW)?.label === 'last month');
check('detects "this year"', guessDateRange('how much this year', NOW)?.label === 'this year');
check('detects explicit year', guessDateRange('what happened in 2024', NOW)?.label === '2024');
check('detects "last 3 weeks"', guessDateRange('anything in the last 3 weeks', NOW)?.label === 'last 3 weeks');
check('detects "yesterday"', guessDateRange('what did I do yesterday', NOW)?.label === 'yesterday');
check('returns null with no period', guessDateRange('when did I last cut my hair', NOW) === null);

{
  const range = guessDateRange('what did I buy last month', NOW)!;
  // NOW is 16 Sep 2026, so "last month" is August.
  check(
    'last month spans August',
    range.from.getMonth() === 7 && range.to.getMonth() === 7,
    `${range.from.toDateString()} -> ${range.to.toDateString()}`
  );
}

section('selectRelevantMemories');
{
  const { memories, hadKeywordMatch } = selectRelevantMemories(
    'When did I last cut my hair?',
    CORPUS,
    NOW
  );
  check('haircut question matches on keywords', hadKeywordMatch);
  check('ranks a haircut memory first', memories[0].title === 'Got a haircut', memories[0]?.title);
  check(
    'newest haircut outranks the older one',
    memories[0].eventDate.startsWith('2026-09-16'),
    memories[0]?.eventDate
  );
}

{
  const { memories } = selectRelevantMemories(
    'How much did I spend on electronics?',
    CORPUS,
    NOW
  );
  const top2 = memories.slice(0, 2).map((m) => m.title).sort();
  check(
    'electronics question surfaces both purchases first',
    top2[0] === 'Bought AirPods' && top2[1] === 'Bought a laptop charger',
    top2
  );
}

{
  const { memories, range } = selectRelevantMemories(
    'what did I buy last month',
    CORPUS,
    NOW
  );
  check('scopes to the named month', range?.label === 'last month');
  check(
    'only August entries survive the window',
    memories.every((m) => new Date(m.eventDate).getMonth() === 7),
    memories.map((m) => m.eventDate)
  );
}

{
  // A question about something never recorded must not fabricate a match.
  const { hadKeywordMatch } = selectRelevantMemories(
    'When did I last go scuba diving?',
    CORPUS,
    NOW
  );
  check('unrecorded topic has no keyword match', hadKeywordMatch === false);
}

{
  const { memories } = selectRelevantMemories('anything at all', CORPUS, NOW, 3);
  check('respects the context cap', memories.length === 3, memories.length);
}

section('formatting');
check('formats INR', formatAmount(18000, 'INR') === '₹18,000', formatAmount(18000, 'INR'));
check('null amount formats to null', formatAmount(null, null) === null);
check('labels today', dayLabel('2026-09-16T12:00:00+05:30', NOW) === 'Today', dayLabel('2026-09-16T12:00:00+05:30', NOW));
check('labels yesterday', dayLabel('2026-09-15T12:00:00+05:30', NOW) === 'Yesterday', dayLabel('2026-09-15T12:00:00+05:30', NOW));

{
  const sorted = [...CORPUS].sort(
    (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
  );
  const sections = groupByDay(sorted, NOW);
  check('groups into one section per day', sections.length === 6, sections.length);
  check('first section is Today', sections[0].title === 'Today', sections[0]?.title);
  check(
    'every memory kept',
    sections.reduce((n, s) => n + s.data.length, 0) === CORPUS.length
  );
}

section('stated time vs invented time');
check('"2 days back" has no clock time', hasStatedTime('2 days back') === false);
check('"yesterday" has no clock time', hasStatedTime('yesterday') === false);
check('no expression has no clock time', hasStatedTime(null) === false);
check('"Friday at 4pm" states a time', hasStatedTime('Friday at 4pm') === true);
check('"tomorrow at 5:30" states a time', hasStatedTime('tomorrow at 5:30') === true);
check('"at 9 a.m." states a time', hasStatedTime('at 9 a.m.') === true);
check('"noon" states a time', hasStatedTime('today at noon') === true);
check('"2 weeks ago" is not a time', hasStatedTime('2 weeks ago') === false);

section('added date');
check(
  'car bought 2 days back, recorded today -> shows ADDED',
  addedLabel({ eventDate: '2026-09-14T15:22:38.000Z', createdAt: '2026-09-16T15:22:38.000Z' }) === 'ADDED 16 SEPT' ||
    addedLabel({ eventDate: '2026-09-14T15:22:38.000Z', createdAt: '2026-09-16T15:22:38.000Z' }) === 'ADDED 16 SEP',
  addedLabel({ eventDate: '2026-09-14T15:22:38.000Z', createdAt: '2026-09-16T15:22:38.000Z' })
);
check(
  'same day -> no ADDED label',
  addedLabel({ eventDate: '2026-09-16T06:00:00.000Z', createdAt: '2026-09-16T09:00:00.000Z' }) === null
);

section('local timestamp sent to the model');
{
  const stamp = localTimestamp('2026-09-15T20:10:00.000Z');
  check('has a UTC offset, not Z', /[+-]\d{2}:\d{2}$/.test(stamp), stamp);
  check(
    'names the same instant',
    new Date(stamp).getTime() === new Date('2026-09-15T20:10:00.000Z').getTime(),
    stamp
  );
}

section('when reminders notify');
{
  // A fixed "now": Wed 16 Sep 2026, 14:00 local.
  const now = new Date(2026, 8, 16, 14, 0, 0);
  const at = (y: number, mo: number, d: number, h = 12, mi = 0) =>
    new Date(y, mo, d, h, mi, 0).toISOString();
  const base = { status: 'active' as const };

  const passport = reminderTime(
    { ...base, type: 'reminder', eventDate: at(2026, 9, 16), dateExpression: 'next month' },
    now
  );
  check(
    'date-only reminder -> 9:00 AM that day',
    passport?.getHours() === 9 && passport?.getMinutes() === 0 && passport?.getDate() === 16 && passport?.getMonth() === 9,
    passport?.toString()
  );

  const pills = reminderTime(
    { ...base, type: 'reminder', eventDate: at(2026, 8, 17, 20, 30), dateExpression: 'tomorrow at 8:30pm' },
    now
  );
  check('stated time reminder -> exactly that time', pills?.getHours() === 20 && pills?.getMinutes() === 30, pills?.toString());

  const dentist = reminderTime(
    { ...base, type: 'appointment', eventDate: at(2026, 8, 18, 16, 0), dateExpression: 'Friday at 4pm' },
    now
  );
  check('appointment with time -> 30 min before', dentist?.getHours() === 15 && dentist?.getMinutes() === 30, dentist?.toString());

  const callMom = reminderTime(
    { ...base, type: 'reminder', eventDate: at(2026, 8, 16), dateExpression: 'today' },
    now
  );
  check(
    'date-only for today after 9 AM -> an hour from now, not dropped',
    callMom?.getTime() === now.getTime() + 60 * 60_000,
    callMom?.toString()
  );

  check(
    'past reminder -> no notification',
    reminderTime({ ...base, type: 'reminder', eventDate: at(2026, 8, 10), dateExpression: 'last week' }, now) === null
  );
  check(
    'purchases never notify',
    reminderTime({ ...base, type: 'purchase', eventDate: at(2026, 9, 1), dateExpression: 'next month' }, now) === null
  );
  check(
    'done reminders never notify',
    reminderTime({ status: 'done', type: 'reminder', eventDate: at(2026, 9, 1), dateExpression: 'next month' }, now) === null
  );
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
