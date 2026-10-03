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
import {
  DEFAULT_WAKE_PHRASES,
  END_OF_SPEECH_MS,
  isStopCommand,
  MAX_MS,
  matchesTrailingPhrase,
  SAFETY_STOP_MS,
  shouldFinish,
} from '../src/voiceStop';
import { isFreshPartial, joinSpelledLetters, knownPeople, restatesEarlier } from '../src/speechText';
import { listSections } from '../src/lists';
import { hasPassed, isStruck, overdueToClose, sinkStruck } from '../src/strike';
import { nextCursor, shouldApplyRemote, toLocal, toRemote } from '../src/sync/mapping';
import { acceptCorrection, similarity } from '../src/titleMatch';
import { lookupSpelling, spellingHints, spellingKey } from '../src/dictionary';
import { backoffFor, nextDue, shouldRetry, MAX_ATTEMPTS, type PendingNote } from '../src/pendingNotes';
import { widgetItems } from '../src/widget/widgetItems';

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
    updatedAt: partial.createdAt ?? partial.eventDate,
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
{
  // Local-time fixtures so the expected clock time holds in any timezone.
  const local = (d: number, h: number, m: number) => new Date(2026, 8, d, h, m).toISOString();

  const car = addedLabel({ eventDate: local(14, 12, 0), createdAt: local(16, 23, 4) });
  check(
    'recorded on a later day -> date and time',
    /^ADDED 16 SEPT?, 23:04$/.test(car),
    car
  );

  const cream = addedLabel({ eventDate: local(16, 23, 4), createdAt: local(16, 23, 5) });
  check('recorded the same day -> time only', cream === 'ADDED 23:05', cream);
}

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

section('live-caption voice: when to stop');
check('MAX_MS wins regardless of activity', shouldFinish(true, MAX_MS, 0) === true);
check('mid-speech, recently active -> keep going', shouldFinish(true, 3000, 500) === false);
check('mid-speech, quiet for the full pause -> stop', shouldFinish(true, 3000, END_OF_SPEECH_MS) === true);
check('mid-speech, quiet for just under the pause -> keep going', shouldFinish(true, 3000, END_OF_SPEECH_MS - 1) === false);
check('never heard anything, still within grace -> keep going', shouldFinish(false, SAFETY_STOP_MS - 1, SAFETY_STOP_MS - 1) === false);
check('never heard anything, grace elapsed -> stop', shouldFinish(false, SAFETY_STOP_MS, SAFETY_STOP_MS) === true);

section('live-caption voice: stop phrase');
check('"stop listening" alone is a stop command', isStopCommand('stop listening') === true);
check('"Stop Listening." (case/punctuation) is a stop command', isStopCommand('Stop Listening.') === true);
check('"okay stop listening" (short lead-in) is a stop command', isStopCommand('okay stop listening') === true);
check('bare "stop" is a stop command', isStopCommand('stop') === true);
check(
  'a note that happens to mention the words is NOT a stop command',
  isStopCommand('remind me to stop listening to that podcast tonight') === false
);
check('unrelated note text is not a stop command', isStopCommand('bought a shirt for 1200 rupees') === false);
check('empty segment is not a stop command', isStopCommand('') === false);

section('voice: spelled names');
{
  const cases: Array<[string, string, string]> = [
    ['separate letters join into the name', 'call J O H N tomorrow', 'call John tomorrow'],
    ['dotted letters', 'meet J. A. N. E. at noon', 'meet Jane at noon'],
    ['hyphenated letters', 'lunch with R-A-H-U-L', 'lunch with Rahul'],
    ['misheard name before the spelling is replaced', 'call Jon J O H N tomorrow', 'call John tomorrow'],
    ['a different word before it is kept', 'talk to J I M later', 'talk to Jim later'],
    ['trailing comma is kept', 'with A N N, then home', 'with Ann, then home'],
    ['"I" and "a" alone are left alone', 'I bought a shirt', 'I bought a shirt'],
    ['two letters are not joined', 'plan B A later', 'plan B A later'],
  ];
  for (const [name, input, expected] of cases) {
    check(name, joinSpelledLetters(input) === expected, joinSpelledLetters(input));
  }
}

section('voice: live transcript restarts');
check(
  'growing transcript is a revision',
  isFreshPartial('remind me to call', 'remind me to call mom tomorrow') === false
);
check(
  'revised wording of similar length is a revision',
  isFreshPartial('buy milk and eggs from the shop', 'by milk and eggs from the shop') === false
);
check(
  'much shorter, different opening is a restart',
  isFreshPartial('remind me to call mom tomorrow at five', 'and also buy') === true
);
check('short texts are never a restart', isFreshPartial('buy milk', 'call') === false);
check(
  'final result repeating kept text is detected',
  restatesEarlier('remind me to call mom and also buy milk', 'remind me to call mom tomorrow') === true
);
check(
  'final result covering only new words is not',
  restatesEarlier('and also buy milk', 'remind me to call mom tomorrow') === false
);

section('voice: known names');
{
  const people = knownPeople([
    { people: 'Rahul, Anjali', createdAt: '2026-09-10T10:00:00Z' },
    { people: 'rahul', createdAt: '2026-09-01T10:00:00Z' },
    { people: 'Fathima', createdAt: '2026-09-15T10:00:00Z' },
    { people: null, createdAt: '2026-09-16T10:00:00Z' },
  ]);
  check('newest first, deduplicated ignoring case', people.join('|') === 'Fathima|Rahul|Anjali', people);
}

section('wake word: matches phrase');
check(
  '"start recording" alone wakes',
  matchesTrailingPhrase('start recording', DEFAULT_WAKE_PHRASES) === true
);
check('"hey PERAI" (case) wakes', matchesTrailingPhrase('hey PERAI', DEFAULT_WAKE_PHRASES) === true);
check(
  '"okay, start recording" (short lead-in) wakes',
  matchesTrailingPhrase('okay, start recording', DEFAULT_WAKE_PHRASES) === true
);
check(
  'a note that happens to end with the phrase after a long sentence does NOT wake',
  matchesTrailingPhrase(
    'remind me every single week to start recording',
    DEFAULT_WAKE_PHRASES
  ) === false
);
check(
  'unrelated note text does not wake',
  matchesTrailingPhrase('bought a shirt for 1200 rupees', DEFAULT_WAKE_PHRASES) === false
);
check('empty segment does not wake', matchesTrailingPhrase('', DEFAULT_WAKE_PHRASES) === false);

section('home screen widget');
{
  const now = new Date(2026, 8, 17, 14, 0);
  const at = (d: number, h = 12) => new Date(2026, 8, d, h, 0).toISOString();
  const entries: Memory[] = [
    memory({ title: 'Low task', type: 'task', priority: 'low', eventDate: at(16) }),
    memory({ title: 'No-priority reminder', type: 'reminder', eventDate: at(18), dateExpression: 'tomorrow' }),
    memory({ title: 'High later', type: 'reminder', priority: 'high', eventDate: at(20, 16), dateExpression: 'sunday at 4pm' }),
    memory({ title: 'High sooner', type: 'appointment', priority: 'high', eventDate: at(18, 10), dateExpression: 'tomorrow at 10am' }),
    memory({ title: 'Medium task', type: 'task', priority: 'medium', eventDate: at(17) }),
    memory({ title: 'Past reminder', type: 'reminder', priority: 'high', eventDate: at(15), dateExpression: 'tuesday' }),
    memory({ title: 'Done task', type: 'task', priority: 'high', status: 'done', eventDate: at(17) }),
    memory({ title: 'A purchase', type: 'purchase', priority: 'high', eventDate: at(17) }),
  ];
  const { items, total } = widgetItems(entries, now);
  const titles = items.map((i) => i.title);

  check(
    'ordered by priority, then soonest',
    titles.join('|') === 'High sooner|High later|Medium task|Low task|No-priority reminder',
    titles
  );
  check('a reminder from an earlier day is dropped', !titles.includes('Past reminder'));
  check('an old task stays until done', titles.includes('Low task'));
  check('done items and purchases are left out', !titles.includes('Done task') && !titles.includes('A purchase'));
  check('total counts every open item', total === 5, total);
  check('stated time is shown', items[0].when === `Tomorrow ${new Date(at(18, 10)).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`, items[0].when);
  check('date-only reminder shows the day without a time', items[4].when === 'Tomorrow', items[4].when);
  check('a task with no stated date shows no date', items[2].when === null, items[2].when);
  check('limit caps the list but not the total', widgetItems(entries, now, 2).items.length === 2 && widgetItems(entries, now, 2).total === 5);
}

section('play, watch and wish lists');
{
  const at = (d: number) => new Date(2026, 8, d, 12, 0).toISOString();
  const entries: Memory[] = [
    memory({ title: 'Hollow Knight', type: 'play', eventDate: at(10), createdAt: at(10) }),
    memory({ title: 'Elden Ring', type: 'play', priority: 'high', eventDate: at(9), createdAt: at(9) }),
    memory({ title: 'Doom', type: 'play', status: 'done', eventDate: at(8), createdAt: at(8) }),
    memory({ title: 'Dune', type: 'watch', eventDate: at(11), createdAt: at(11) }),
    memory({ title: 'Standing desk', type: 'wish', amount: 12000, eventDate: at(12), createdAt: at(12) }),
    memory({ title: 'Watched Dune last night', type: 'memory', eventDate: at(12), createdAt: at(12) }),
    memory({ title: 'Call the dentist', type: 'task', eventDate: at(12), createdAt: at(12) }),
  ];
  const [play, watch, wish] = listSections(entries);

  check('three lists, in order', listSections(entries).map((s) => s.type).join('|') === 'play|watch|wish');
  check('priority first, then newest', play.open.map((m) => m.title).join('|') === 'Elden Ring|Hollow Knight', play.open.map((m) => m.title));
  check('done items are kept separately', play.done.map((m) => m.title).join('|') === 'Doom');
  check('watchlist holds only what is still to watch', watch.open.length === 1 && watch.open[0].title === 'Dune');
  check('a memory about watching is not on the watchlist', watch.open.concat(watch.done).every((m) => m.type === 'watch'));
  check('wishlist keeps the amount', wish.open[0].amount === 12000);
  check('tasks stay out of the lists', listSections(entries).every((s) => s.open.concat(s.done).every((m) => m.type === s.type)));
  check('finished items are capped', listSections(entries, 0)[0].done.length === 0);
}

check(
  'list items never reach the home screen widget',
  widgetItems(
    [
      memory({ title: 'Dune', type: 'watch', eventDate: new Date().toISOString() }),
      memory({ title: 'Standing desk', type: 'wish', eventDate: new Date().toISOString() }),
    ],
    new Date()
  ).total === 0
);

section('searched spellings');
check('a misheard title is corrected', acceptCorrection('ghost of yachty', 'Ghost of Yōtei') === true);
check('accents alone count as a correction', acceptCorrection('Pokemon Legends Z-A', 'Pokémon Legends: Z-A') === true);
check('punctuation and case alone count', acceptCorrection('dune part two', 'Dune: Part Two') === true);
check('a different title is refused', acceptCorrection('Hollow Knight', 'Elden Ring') === false);
check('a sequel is refused', acceptCorrection('Hollow Knight', 'Hollow Knight: Silksong') === false);
check('an explanation instead of a title is refused', acceptCorrection('ghost of yachty', 'The game you mean is Ghost of Yōtei, released in 2025.') === false);
check('an identical answer is not a correction', acceptCorrection('Hollow Knight', 'Hollow Knight') === false);
check('capitalisation alone is still worth taking', acceptCorrection('iphone 17 pro', 'iPhone 17 Pro') === true);
check('an empty answer is refused', acceptCorrection('Hollow Knight', '   ') === false);
check('quotes around the answer are tolerated', acceptCorrection('ghost of yachty', '"Ghost of Yōtei"') === true);
check('identical titles score 1', similarity('Dune: Part Two', 'dune part two') === 1);

section('remembered spellings');
{
  const known = [
    { heard: spellingKey('ghost of yachty'), correct: 'Ghost of Yōtei' },
    { heard: spellingKey('fathima'), correct: 'Fathima' },
  ];
  check('the misheard form is corrected', lookupSpelling('ghost of yachty', known) === 'Ghost of Yōtei');
  check('punctuation and case do not matter', lookupSpelling('Ghost of Yachty!', known) === 'Ghost of Yōtei');
  check(
    'the corrected form is recognised too, so it is never searched again',
    lookupSpelling('ghost of yotei', known) === 'Ghost of Yōtei'
  );
  check('an exact match needs no change', lookupSpelling('Ghost of Yōtei', known) === null);
  check('an unknown title is not guessed at', lookupSpelling('Elden Ring', known) === null);
  check('an empty title is ignored', lookupSpelling('  ', known) === null);
  check(
    'hints list learned titles then the record, without repeats',
    spellingHints(known, ['Ghost of Yōtei', 'Elden Ring']).join('|') === 'Ghost of Yōtei|Fathima|Elden Ring'
  );
}

section('notes waiting to be filed');
{
  const note = (over: Partial<PendingNote> = {}): PendingNote => ({
    id: 'n1',
    text: 'remind me to call mom',
    createdAt: '2026-09-18T10:00:00.000Z',
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
    ...over,
  });
  const at = (iso: string) => new Date(iso);

  check('a freshly queued note is tried at once', shouldRetry(note()) === true);
  check(
    'a note tried a moment ago waits',
    shouldRetry(note({ attempts: 1, lastAttemptAt: '2026-09-18T10:00:00.000Z' }), at('2026-09-18T10:00:30.000Z')) === false
  );
  check(
    'it is tried again once the wait has passed',
    shouldRetry(note({ attempts: 1, lastAttemptAt: '2026-09-18T10:00:00.000Z' }), at('2026-09-18T10:06:00.000Z')) === true
  );
  check('waits get longer, then level off', backoffFor(0) < backoffFor(2) && backoffFor(9) === backoffFor(3));
  check(
    'a note that keeps failing stops retrying itself',
    shouldRetry(note({ attempts: MAX_ATTEMPTS, lastAttemptAt: '2026-09-18T10:00:00.000Z' }), at('2027-01-01T00:00:00.000Z')) === false
  );
  check(
    'the oldest due note goes first',
    nextDue([
      note({ id: 'newer', createdAt: '2026-09-18T12:00:00.000Z' }),
      note({ id: 'older', createdAt: '2026-09-18T09:00:00.000Z' }),
    ])?.id === 'older'
  );
  check(
    'nothing due means nothing to do',
    nextDue([note({ attempts: 1, lastAttemptAt: '2026-09-18T10:00:00.000Z' })], at('2026-09-18T10:00:10.000Z')) === null
  );
}

section('struck out: done, or the moment has gone');
{
  const now = new Date(2026, 8, 18, 14, 0);
  const at = (d: number, h = 12) => new Date(2026, 8, d, h, 0).toISOString();

  check(
    'a stated time that has gone by strikes out',
    hasPassed(memory({ title: 'Dentist', type: 'appointment', eventDate: at(18, 10), dateExpression: 'today at 10am' }), now) === true
  );
  check(
    'a stated time still ahead does not',
    hasPassed(memory({ title: 'Dentist', type: 'appointment', eventDate: at(18, 16), dateExpression: 'today at 4pm' }), now) === false
  );
  check(
    'a day with no time lasts until the day is over',
    hasPassed(memory({ title: 'Call the bank', type: 'task', eventDate: at(18), dateExpression: 'today' }), now) === false
  );
  check(
    'yesterday, with no time stated, has gone by',
    hasPassed(memory({ title: 'Call the bank', type: 'task', eventDate: at(17), dateExpression: 'yesterday' }), now) === true
  );
  check(
    'an entry with no date given is never overdue',
    hasPassed(memory({ title: 'Buy milk', type: 'task', eventDate: at(10), dateExpression: null }), now) === false
  );
  check(
    'something that already happened is not overdue',
    hasPassed(memory({ title: 'Bought a shirt', type: 'purchase', eventDate: at(10), dateExpression: 'last week' }), now) === false
  );

  check(
    'ticking it off strikes it out whatever the date',
    isStruck(memory({ title: 'Buy milk', type: 'task', status: 'done', eventDate: at(20), dateExpression: null }), now) === true
  );
  check(
    'passing time does not mark it done, only strikes it',
    isStruck(memory({ title: 'Call the bank', type: 'task', eventDate: at(17), dateExpression: 'yesterday' }), now) === true
  );
  check(
    'an ordinary memory is never struck',
    isStruck(memory({ title: 'Got a haircut', eventDate: at(10), dateExpression: 'last week' }), now) === false
  );

  check(
    'tapping an overdue entry back to active keeps it active',
    hasPassed(
      memory({
        title: 'Call the bank',
        type: 'task',
        eventDate: at(17),
        dateExpression: 'yesterday',
        // Touched after it fell due: you said you still mean to do it.
        updatedAt: new Date(2026, 8, 18, 13, 0).toISOString(),
      }),
      now
    ) === false
  );

  const sweep = [
    memory({ title: 'Missed', type: 'task', eventDate: at(17), dateExpression: 'yesterday' }),
    memory({ title: 'Still ahead', type: 'task', eventDate: at(20), dateExpression: 'sunday' }),
    memory({ title: 'Already done', type: 'task', status: 'done', eventDate: at(17), dateExpression: 'yesterday' }),
    memory({ title: 'No date', type: 'task', eventDate: at(10), dateExpression: null }),
    memory({ title: 'Old memory', eventDate: at(10), dateExpression: 'last week' }),
  ];
  const closing = overdueToClose(sweep, now);
  check(
    'only overdue, still-active, dated things are recorded as done',
    closing.length === 1 && closing[0] === sweep[0].id,
    closing
  );

  const day = [
    memory({ title: 'Done task', type: 'task', status: 'done', eventDate: at(18), dateExpression: null }),
    memory({ title: 'Open task', type: 'task', eventDate: at(18), dateExpression: null }),
    memory({ title: 'Missed appointment', type: 'appointment', eventDate: at(18, 9), dateExpression: 'today at 9am' }),
    memory({ title: 'Later appointment', type: 'appointment', eventDate: at(18, 18), dateExpression: 'today at 6pm' }),
  ];
  check(
    'struck entries sink below the rest, each keeping its order',
    sinkStruck(day, now).map((m) => m.title).join('|') ===
      'Open task|Later appointment|Done task|Missed appointment',
    sinkStruck(day, now).map((m) => m.title)
  );
}

section('syncing with the server');
{
  check(
    'a row the phone has never seen is taken',
    shouldApplyRemote(null, '2026-09-18T10:00:00.000Z') === true
  );
  check(
    'a newer copy from the server wins',
    shouldApplyRemote('2026-09-18T10:00:00.000Z', '2026-09-18T11:00:00.000Z') === true
  );
  check(
    'an older copy from the server is ignored',
    shouldApplyRemote('2026-09-18T11:00:00.000Z', '2026-09-18T10:00:00.000Z') === false
  );
  check(
    'the same moment leaves the phone alone',
    shouldApplyRemote('2026-09-18T10:00:00.000Z', '2026-09-18T10:00:00.000Z') === false
  );
  check(
    'a differently written but equal time is still a tie',
    shouldApplyRemote('2026-09-18T10:00:00.000Z', '2026-09-18T10:00:00+00:00') === false
  );

  check(
    'the cursor moves to the newest row read',
    nextCursor(
      [{ updated_at: '2026-09-18T10:00:00.000Z' }, { updated_at: '2026-09-18T12:00:00.000Z' }],
      null
    ) === '2026-09-18T12:00:00.000Z'
  );
  check(
    'the cursor never moves backwards',
    nextCursor([{ updated_at: '2026-09-01T10:00:00.000Z' }], '2026-09-18T12:00:00.000Z') ===
      '2026-09-18T12:00:00.000Z'
  );
  check('an empty page leaves the cursor alone', nextCursor([], '2026-09-18T12:00:00.000Z') === '2026-09-18T12:00:00.000Z');

  const local = {
    ...memory({
      title: 'Bought a shirt',
      type: 'purchase',
      eventDate: '2026-09-18T12:00:00.000Z',
      amount: 1200,
      currency: 'INR',
      people: 'Rahul',
      dateExpression: 'yesterday',
      priority: 'high' as const,
    }),
    updatedAt: '2026-09-18T12:30:00.000Z',
    deleted: false,
  };
  const round = toLocal({ ...toRemote(local), updated_at: local.updatedAt });
  const sorted = (value: object) =>
    JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
  check(
    'a row survives the trip to the server and back unchanged',
    sorted(round) === sorted(local),
    sorted(round)
  );
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
