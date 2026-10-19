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
  END_OF_SPEECH_MS,
  isStopCommand,
  MAX_MS,
  matchesTrailingPhrase,
  SAFETY_STOP_MS,
  shouldFinish,
} from '../src/voiceStop';
import { isFreshPartial, joinSpelledLetters, knownPeople, restatesEarlier } from '../src/speechText';
import { listSections } from '../src/lists';
import { answerFromList, listQuestion } from '../src/listQuestion';
import { conversationQuery } from '../src/ai/ask';
import { hasPassed, isStruck, overdueToClose, sinkStruck } from '../src/strike';
import { nextOccurrence } from '../src/repeat';
import { planDay } from '../src/today';
import { weekInReview } from '../src/review';
import {
  budgetTone,
  budgetTotals,
  categoryBudgetStatus,
  crossedThreshold,
} from '../src/expense/budgets';
import { monthRange } from '../src/expense/dates';
import { sum } from '../src/expense/stats';
import {
  categoryBreakdown,
  isValidSpan,
  linkId,
  suggestExpenses,
  totalsByCurrency,
  type LinkableExpense,
} from '../src/expense/tripSpending';
import { tripSpendQuestion } from '../src/tripQuestion';
import { needsTranslation, normalizeMoney, normalizeQuery } from '../src/manglish';
import {
  changeLabel,
  describeChange,
  isDestructive,
  MAX_BATCH,
  snapshot,
  undoPatch,
  validateActions,
  type ExpenseTarget,
} from '../src/actions';
import { looksLikeCommand } from '../src/ai/commandGate';
import { dueToday, parseWhen } from '../src/whenText';
import {
  groupNames,
  groupSummaries,
  MAX_TASKS_AT_ONCE,
  splitTasks,
  membersOf,
  normalizeGroupName,
  sameGroup,
} from '../src/groups';


import type { Category as ExpenseCategory } from '../src/expense/db';

import { nextCursor, shouldApplyRemote, toLocal, toRemote } from '../src/sync/mapping';
import { isQuotaError, nextDailyReset, quotaMessage, quotaWait } from '../src/ai/quota';
import { acceptCorrection, similarity } from '../src/titleMatch';
import { lookupSpelling, spellingHints, spellingKey } from '../src/dictionary';
import { backoffFor, nextDue, shouldRetry, MAX_ATTEMPTS, type PendingNote } from '../src/pendingNotes';
import { widgetItems } from '../src/widget/widgetItems';
import { computeNetWorth } from '../src/expense/accountsLogic';

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
    repeat: null,
    endDate: null,
    groupName: null,
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

section('spoken phrases are matched conservatively');
{
  const phrases = ['stop listening', 'that is all'];
  check('the phrase alone matches', matchesTrailingPhrase('that is all', phrases) === true);
  check('case and punctuation do not matter', matchesTrailingPhrase('That is all.', phrases) === true);
  check('a short lead-in still matches', matchesTrailingPhrase('okay that is all', phrases) === true);
  check(
    'a sentence that merely ends with it does not',
    matchesTrailingPhrase('tell him the money he gave me is that is all', phrases) === false
  );
  check('unrelated text does not', matchesTrailingPhrase('bought a shirt', phrases) === false);
  check('nothing said does not', matchesTrailingPhrase('', phrases) === false);
}

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
check(
  'a publisher in front of the real title is tolerated',
  acceptCorrection('spider man my smallers', "Marvel's Spider-Man: Miles Morales") === true
);
check(
  'but a sequel behind a publisher is still refused',
  acceptCorrection('Hollow Knight', "Team Cherry's Hollow Knight: Silksong") === false
);
check(
  'and a different game behind a publisher is still refused',
  acceptCorrection('Hollow Knight', "FromSoftware's Elden Ring") === false
);
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

section('running out of AI for the day');
{
  const QUOTA = '429 You exceeded your current quota, please check your plan and billing details.';
  check('a quota refusal is recognised', isQuotaError(QUOTA) === true);
  check('a 429 by any wording is recognised', isQuotaError('Too Many Requests') === true);
  check('an ordinary failure is not', isQuotaError('Could not reach the network') === false);

  // Midnight in California, from a known instant: 2026-10-03T12:00Z is
  // 05:00 Pacific (daylight time), so 19 hours remain.
  const noon = new Date('2026-10-03T12:00:00.000Z');
  check(
    'the daily reset is the next midnight Pacific',
    nextDailyReset(noon).toISOString() === '2026-10-04T07:00:00.000Z',
    nextDailyReset(noon).toISOString()
  );
  check('the reset is always ahead', nextDailyReset(noon).getTime() > noon.getTime());
  check(
    'and never more than a day ahead',
    nextDailyReset(noon).getTime() - noon.getTime() <= 24 * 3_600_000
  );

  const burst = quotaWait('429 rate limit exceeded, retry in 23s', noon);
  check('a short wait the API asks for is taken as a burst limit', burst.kind === 'burst');
  check('and honoured exactly', burst.retryAt.toISOString() === '2026-10-03T12:00:23.000Z');

  check('anything else is treated as the daily allowance', quotaWait(QUOTA, noon).kind === 'day');
  check(
    'a long wait is the daily allowance too',
    quotaWait('429 quota exceeded, retry in 4000s', noon).kind === 'day'
  );
  check(
    'a per-day message is the daily allowance even with a short wait',
    quotaWait('429 quota exceeded for requests per day, retry in 5s', noon).kind === 'day'
  );

  check('the message says it is the day that ran out', /quota is used up/i.test(quotaMessage(QUOTA, noon)));
  check('and says when it comes back', /comes back at about/i.test(quotaMessage(QUOTA, noon)));
  check(
    'a burst limit reads differently',
    /busy for a moment/i.test(quotaMessage('429 retry in 23s', noon))
  );
}

section('following on from the last question');
{
  check(
    'a first question searches on its own words',
    conversationQuery('how much did I spend in september', []) === 'how much did I spend in september'
  );
  check(
    'a follow-up carries the question before it',
    conversationQuery('and the month before?', [
      { question: 'how much did I spend in september', answer: 'You spent ₹4,900.' },
    ]) === 'how much did I spend in september and the month before?'
  );
  check(
    'only the question just before is carried',
    conversationQuery('who was with me?', [
      { question: 'what did I do in july', answer: 'Nothing recorded.' },
      { question: 'what did I do last week', answer: 'Dinner with Rahul.' },
    ]) === 'what did I do last week who was with me?'
  );
}

section('list questions answered without the AI');
{
  const asked = (q: string, dated = false) => listQuestion(q, dated);

  check('pending games', JSON.stringify(asked('which are the pending games')) === '{"type":"play","state":"pending"}', asked('which are the pending games'));
  check('games still to play', asked('what games are still to play')?.state === 'pending');
  check('finished games', JSON.stringify(asked('which games have I already played')) === '{"type":"play","state":"done"}');
  check('the watchlist', JSON.stringify(asked('what is on my watchlist')) === '{"type":"watch","state":"pending"}');
  check('films left to watch', asked('which movies are left to watch')?.type === 'watch');
  check('things still to buy', asked('what do I still want to buy')?.type === 'wish');

  check('a spending question is left to the model', asked('how much did I spend on games') === null);
  check('a question naming a period is left to the model', asked('which games did I play', true) === null);
  check('an unrelated question is left to the model', asked('when did I last cut my hair') === null);
  check('a bare mention of a game is left to the model', asked('did I like that game') === null);

  const at = (d: number) => new Date(2026, 9, d, 12, 0).toISOString();
  const games = [
    memory({ title: 'Ghost of Yōtei', type: 'play', eventDate: at(3), createdAt: at(3) }),
    memory({ title: 'Elden Ring', type: 'play', eventDate: at(2), createdAt: at(2) }),
    memory({ title: 'Hollow Knight', type: 'play', status: 'done', eventDate: at(1), createdAt: at(1) }),
    memory({ title: 'Dune: Part Two', type: 'watch', eventDate: at(3), createdAt: at(3) }),
    memory({ title: 'Bought a shirt', type: 'purchase', eventDate: at(3), createdAt: at(3) }),
  ];

  const pending = answerFromList({ type: 'play', state: 'pending' }, games);
  check('counts every pending game and no others', pending.entries.length === 2, pending.entries.map((m) => m.title));
  check('newest first', pending.entries[0].title === 'Ghost of Yōtei');
  check('headline is the count', pending.headline === '2 games', pending.headline);
  check('one line per game', pending.items.length === 2 && pending.items[0].includes('Ghost of Yōtei'), pending.items);
  check('a finished game is left out', !pending.entries.some((m) => m.title === 'Hollow Knight'));

  const done = answerFromList({ type: 'play', state: 'done' }, games);
  check('the finished list holds only finished games', done.entries.length === 1 && done.entries[0].title === 'Hollow Knight');

  const empty = answerFromList({ type: 'wish', state: 'pending' }, games);
  check('an empty list says so', empty.headline === 'None' && /empty/i.test(empty.answer), empty.answer);
  check('one game reads as singular', answerFromList({ type: 'watch', state: 'pending' }, games).headline === '1 thing to watch');
}

section('repeating entries');
{
  const now = new Date(2026, 9, 13, 9, 0); // 13 Oct 2026, 09:00
  const iso = (y: number, m: number, d: number, h = 9) => new Date(y, m, d, h, 0).toISOString();
  const on = (value: string) => new Date(value);

  check(
    'daily moves to the next day',
    on(nextOccurrence(iso(2026, 9, 13), 'daily', now)).getDate() === 14
  );
  check(
    'weekly moves a week on',
    on(nextOccurrence(iso(2026, 9, 13), 'weekly', now)).getDate() === 20
  );
  check(
    'monthly moves a month on',
    on(nextOccurrence(iso(2026, 9, 13), 'monthly', now)).getMonth() === 10
  );
  check(
    'the time of day is kept',
    on(nextOccurrence(iso(2026, 9, 13, 18), 'weekly', now)).getHours() === 18
  );
  check(
    'something missed for weeks comes back next week, not four times over',
    on(nextOccurrence(iso(2026, 8, 15), 'weekly', now)).getTime() > now.getTime() &&
      on(nextOccurrence(iso(2026, 8, 15), 'weekly', now)).getDate() === 20,
    nextOccurrence(iso(2026, 8, 15), 'weekly', now)
  );
  check(
    'the 31st becomes the 30th in a short month',
    on(nextOccurrence(iso(2026, 9, 31), 'monthly', now)).getDate() === 30 &&
      on(nextOccurrence(iso(2026, 9, 31), 'monthly', now)).getMonth() === 10
  );
  check(
    '31 January lands in February, not March',
    on(nextOccurrence(iso(2027, 0, 31), 'monthly', new Date(2027, 0, 31, 10))).getMonth() === 1
  );
}

section("today's plan");
{
  const now = new Date(2026, 9, 13, 14, 0); // Tuesday afternoon
  const at = (d: number, h = 12) => new Date(2026, 9, d, h, 0).toISOString();

  const entries: Memory[] = [
    memory({ title: 'Missed dentist', type: 'appointment', eventDate: at(11, 10), dateExpression: 'sunday at 10am' }),
    memory({ title: 'Call the bank', type: 'task', eventDate: at(13), dateExpression: 'today' }),
    memory({ title: 'Standup', type: 'appointment', eventDate: at(13, 9), dateExpression: 'today at 9am' }),
    memory({ title: 'Buy milk', type: 'task', eventDate: at(1), dateExpression: null }),
    memory({ title: 'Gym', type: 'reminder', eventDate: at(14, 7), dateExpression: 'tomorrow at 7am' }),
    memory({ title: 'Next week', type: 'task', eventDate: at(20), dateExpression: 'next tuesday' }),
    memory({ title: 'Already done', type: 'task', status: 'done', eventDate: at(13), dateExpression: 'today' }),
    memory({ title: 'A purchase', type: 'purchase', eventDate: at(13), dateExpression: 'today' }),
  ];

  const plan = planDay(entries, now);
  check('what is late comes first', plan.overdue.map((m) => m.title).join('|') === 'Missed dentist', plan.overdue.map((m) => m.title));
  check(
    "today holds today's work and anything undated",
    plan.today.map((m) => m.title).join('|') === 'Standup|Call the bank|Buy milk',
    plan.today.map((m) => m.title)
  );
  check('tomorrow is kept separate', plan.tomorrow.map((m) => m.title).join('|') === 'Gym');
  check('later days are not shown', !JSON.stringify(plan).includes('Next week'));
  check('finished work is not shown', !JSON.stringify(plan).includes('Already done'));
  check('a purchase is a record, not work', !JSON.stringify(plan).includes('A purchase'));
  check('the count covers late and today only', plan.count === 4, plan.count);
}

section('the week in review');
{
  const now = new Date(2026, 9, 13, 18, 0);
  const ago = (days: number) => new Date(2026, 9, 13 - days, 12, 0).toISOString();

  const entries: Memory[] = [
    memory({ title: 'Bought a shirt', type: 'purchase', amount: 1200, currency: 'INR', eventDate: ago(2), createdAt: ago(2) }),
    memory({ title: 'Bought a lamp', type: 'purchase', amount: 800, currency: 'INR', eventDate: ago(20), createdAt: ago(20) }),
    memory({ title: 'Call the bank', type: 'task', status: 'done', eventDate: ago(3), createdAt: ago(3), updatedAt: ago(1) }),
    memory({ title: 'Missed dentist', type: 'appointment', eventDate: ago(2), dateExpression: 'yesterday at 10am', createdAt: ago(5) }),
    memory({ title: 'Gym tomorrow', type: 'reminder', eventDate: new Date(2026, 9, 14, 7, 0).toISOString(), dateExpression: 'tomorrow at 7am', createdAt: ago(1) }),
  ];

  const week = weekInReview(entries, now);
  check('only this week counts as recorded', week.recorded.length === 4, week.recorded.map((m) => m.title));
  check('what was ticked off this week is counted', week.finished.map((m) => m.title).join('|') === 'Call the bank');
  check('what is late is called out', week.slipped.map((m) => m.title).join('|') === 'Missed dentist');
  check('what is still ahead is kept apart', week.ahead.map((m) => m.title).join('|') === 'Gym tomorrow');
  check('spending covers this week only', week.spent[0].total === 1200 && week.spent[0].currency === 'INR', week.spent);
}

section('net worth and wealth calculations');
{
  const mockAccounts = [
    { type: 'bank' as const, balance: 150000 },
    { type: 'cash' as const, balance: 12000 },
    { type: 'stock' as const, balance: 80000 },
    { type: 'crypto' as const, balance: 25000 },
    { type: 'other' as const, balance: 10000 },
  ];
  const mockBorrowLend = {
    totalLentActive: 30000,
    totalBorrowedActive: 15000,
  };

  const res = computeNetWorth(mockAccounts, mockBorrowLend);

  check('bank total aggregates correctly', res.bankTotal === 150000, res.bankTotal);
  check('liquid total is bank + cash', res.liquidTotal === 162000, res.liquidTotal);
  check('total with stocks is liquid + stocks', res.totalWithStocks === 242000, res.totalWithStocks);
  check('total with lend includes active money lent', res.totalWithLend === 272000, res.totalWithLend);
  check(
    'total net worth calculates (all assets + active lent) - borrowed debt',
    res.netWorth === 292000 && res.totalAssets === 277000 && res.totalBorrowed === 15000 && res.totalLent === 30000,
    res
  );
  check('accounts count is correct', res.accountsCount === 5, res.accountsCount);

  // Test empty case
  const emptyRes = computeNetWorth([], { totalLentActive: 0, totalBorrowedActive: 0 });
  check('empty accounts have zero net worth', emptyRes.netWorth === 0 && emptyRes.accountsCount === 0);
}

section('per-category budgets');
{
  const category = (
    id: string,
    name: string,
    monthly_budget: number | null
  ): ExpenseCategory => ({ id, name, icon: 'cart-outline', color: '#2E7DB8', monthly_budget });

  const cats = [
    category('food', 'Food', 3000),
    category('fuel', 'Fuel', 2000),
    category('gifts', 'Gifts', null), // no budget: left out entirely
    category('zero', 'Zero', 0), // a budget of nothing says nothing
  ];

  const spent = new Map([
    ['food', 2100], // exactly 70%
    ['fuel', 2600], // over
    ['gifts', 900],
    ['zero', 50],
  ]);

  const status = categoryBudgetStatus(cats, spent);
  check('only categories with a budget are shown', status.map((s) => s.id).join('|') === 'fuel|food', status.map((s) => s.id));
  check('the most used comes first', status[0].id === 'fuel');
  check('exactly 70% is a warning, not green', status[1].tone === 'warn', status[1]);
  check('over budget is red', status[0].tone === 'over');
  check('what is left can go negative', status[0].remaining === -600, status[0].remaining);

  check('just under 70% is still green', budgetTone(0.6999) === 'good');
  check('exactly 100% is not yet over', budgetTone(1) === 'warn');
  check('a hair over 100% is over', budgetTone(1.0001) === 'over');

  const empty = categoryBudgetStatus(cats, new Map());
  check('a month with nothing spent reads as zero, not missing', empty.length === 2 && empty[0].spent === 0 && empty[0].fraction === 0);

  const totals = budgetTotals(cats, 6000);
  check('budgets add up', totals.allocated === 5000, totals.allocated);
  check('what is left unallocated is reported', totals.unallocated === 1000);
  check('promising less than the overall budget is fine', totals.overAllocated === false);
  check('promising more is flagged', budgetTotals(cats, 4000).overAllocated === true);
  check('with no overall budget nothing is over-allocated', budgetTotals(cats, 0).overAllocated === false);

  // Thresholds: the moment of crossing, not every expense after it.
  check('crossing 80% is announced', crossedThreshold(3000, 2300, 2500) === 0.8);
  check('landing exactly on 80% counts', crossedThreshold(3000, 2000, 2400) === 0.8);
  check('crossing the whole budget is announced', crossedThreshold(3000, 2900, 3100) === 1);
  check('landing exactly on the budget counts', crossedThreshold(3000, 2900, 3000) === 1);
  check('one expense crossing both reports the higher', crossedThreshold(3000, 100, 3100) === 1);
  check('already over says nothing more', crossedThreshold(3000, 3100, 3600) === null);
  check('well short says nothing', crossedThreshold(3000, 100, 200) === null);
  check('no budget says nothing', crossedThreshold(null, 0, 5000) === null);
  check('a zero budget says nothing', crossedThreshold(0, 0, 5000) === null);
}

section('budget month boundaries');
{
  // The month's spend is a SQL range query; these check the range itself.
  const { from, to } = monthRange(2026, 9); // October 2026
  check('a month starts on the 1st', from === '2026-10-01', from);
  check('and ends on its last day', to === '2026-10-31', to);
  check('February is handled', monthRange(2027, 1).to === '2027-02-28', monthRange(2027, 1).to);
  check('a leap February is handled', monthRange(2028, 1).to === '2028-02-29', monthRange(2028, 1).to);
  check('December rolls over correctly', monthRange(2026, 11).to === '2026-12-31');

  const within = (date: string) => date >= from && date <= to;
  check('the first day of the month counts', within('2026-10-01'));
  check('the last day counts', within('2026-10-31'));
  check('the day before does not', !within('2026-09-30'));
  check('the day after does not', !within('2026-11-01'));
}

section('a trip and the spending during it');
{
  const spend = (
    id: string,
    date: string,
    amount: number,
    cat_name = 'Food',
    currency?: string
  ): LinkableExpense => ({ id, date, amount, cat_name, currency });

  const rows = [
    spend('a', '2026-10-02', 500), // the day before
    spend('b', '2026-10-03', 1200, 'Travel'), // first day
    spend('c', '2026-10-04', 800),
    spend('d', '2026-10-06', 300, 'Travel'), // last day
    spend('e', '2026-10-07', 900), // the day after
  ];

  const span = { from: '2026-10-03', to: '2026-10-06' };

  const suggested = suggestExpenses(rows, span);
  check('both boundary days are inside the trip', suggested.map((r) => r.id).join('') === 'bcd', suggested.map((r) => r.id));
  check('the day before is outside', !suggested.some((r) => r.id === 'a'));
  check('the day after is outside', !suggested.some((r) => r.id === 'e'));
  check('suggestions run in date order', suggested[0].date <= suggested[1].date);

  const oneDay = suggestExpenses(rows, { from: '2026-10-04', to: '2026-10-04' });
  check('a single-day trip still gathers that day', oneDay.map((r) => r.id).join('') === 'c', oneDay.map((r) => r.id));

  check('a span that ends before it starts is refused', isValidSpan('2026-10-06', '2026-10-03') === false);
  check('and gathers nothing', suggestExpenses(rows, { from: '2026-10-06', to: '2026-10-03' }).length === 0);
  check('a single day is a valid span', isValidSpan('2026-10-04', '2026-10-04') === true);
  check('a missing end is not a span', isValidSpan('2026-10-04', '') === false);

  const alreadyLinked = suggestExpenses(rows, span, new Set(['c']));
  check('what is already linked is not offered again', alreadyLinked.map((r) => r.id).join('') === 'bd', alreadyLinked.map((r) => r.id));

  // Deleted expenses never reach here: listExpenses filters deleted = 0, and
  // the suggestion list is built from it.
  check('an empty list suggests nothing', suggestExpenses([], span).length === 0);

  const totals = totalsByCurrency(suggested, '₹');
  check('one currency totals to one figure', totals.length === 1 && totals[0].total === 2300, totals);
  check('and counts the expenses behind it', totals[0].count === 3);

  const mixed = totalsByCurrency(
    [spend('x', '2026-10-03', 4000), spend('y', '2026-10-04', 40, 'Food', '$')],
    '₹'
  );
  check('two currencies are never added together', mixed.length === 2, mixed);
  check('the larger total leads', mixed[0].currency === '₹' && mixed[0].total === 4000);
  check('and the other keeps its own', mixed[1].currency === '$' && mixed[1].total === 40);

  const breakdown = categoryBreakdown(suggested);
  check('categories are totalled, biggest first', breakdown[0].name === 'Travel' && breakdown[0].total === 1500, breakdown);
  check('and counted', breakdown[0].count === 2);

  const refundedRows: LinkableExpense[] = [
    { id: 'f', date: '2026-10-03', amount: 1000, cat_name: 'Ticket', refund_amount: 400 },
    { id: 'g', date: '2026-10-04', amount: 500, cat_name: 'Ticket' },
  ];
  const refundedTotals = totalsByCurrency(refundedRows, '₹');
  check(
    'a refund is counted out of the total, not still spent',
    refundedTotals[0].total === 1100,
    refundedTotals
  );
  const refundedBreakdown = categoryBreakdown(refundedRows);
  check('and out of its category too', refundedBreakdown[0].total === 1100, refundedBreakdown);

  check(
    'sum() nets a refund out of the total too',
    sum([{ amount: 1000, refund_amount: 400 }, { amount: 500 }]) === 1100
  );
  check(
    'a row with no refund_amount at all (e.g. income) is untouched',
    sum([{ amount: 500 }, { amount: 300 }]) === 800
  );

  check('a link id is derived from the pair', linkId('mem1', 'exp1') === 'mem1:exp1');
  check('so the same pair is always the same row', linkId('mem1', 'exp1') === linkId('mem1', 'exp1'));
}

section('asking what a trip cost');
{
  const trip = (title: string, endDate: string | null, over: Partial<Memory> = {}) =>
    memory({
      title,
      type: 'memory',
      category: 'Travel',
      eventDate: '2026-10-03T12:00:00.000Z',
      endDate,
      ...over,
    });

  const kozhikode = trip('Kozhikode trip', '2026-10-06T12:00:00.000Z');
  const goa = trip('Goa weekend', '2026-10-20T12:00:00.000Z');
  const haircut = trip('Got a haircut', null);
  const all = [kozhikode, goa, haircut];

  check(
    'a spend question naming the trip finds it',
    tripSpendQuestion('how much did I spend on my Kozhikode trip', all)?.id === kozhikode.id
  );
  check('case does not matter', tripSpendQuestion('what did the KOZHIKODE trip cost', all)?.id === kozhikode.id);
  check('another trip is matched on its own name', tripSpendQuestion('how much was the Goa weekend', all)?.id === goa.id);
  check(
    'a question with no money in it is not ours',
    tripSpendQuestion('when was my Kozhikode trip', all) === null
  );
  check(
    'a spend question naming nothing is not ours',
    tripSpendQuestion('how much did I spend last month', all) === null
  );
  check(
    'common words alone do not match a trip',
    tripSpendQuestion('how much did I spend on the trip', all) === null
  );
  check('an entry with no end date is never a trip', tripSpendQuestion('what did the haircut cost', all) === null);
  check('with nothing recorded there is nothing to match', tripSpendQuestion('how much did I spend on my Kozhikode trip', []) === null);
}

section('manglish: money words');
{
  const money = (text: string) => normalizeMoney(text);
  check('a thousand', money('randu ayiram roopa') === '2000 roopa', money('randu ayiram roopa'));
  check('a scale on its own', money('ayiram roopa') === '1000 roopa', money('ayiram roopa'));
  check('five hundred as one word', money('anjuru roopa adichu') === '500 roopa adichu', money('anjuru roopa adichu'));
  check('two hundred as one word', money('irunooru rupa') === '200 rupa');
  check('a half thousand', money('onnara ayiram') === '1500', money('onnara ayiram'));
  check('ten thousand', money('pathinayiram roopa') === '10000 roopa');
  check('digits with a scale', money('5 ayiram') === '5000');
  check('the k shorthand', money('1.5k petrol') === '1500 petrol', money('1.5k petrol'));
  check('plain digits are left alone', money('500 roopa petrol adichu') === '500 roopa petrol adichu');
  check('english is untouched', money('bought a shirt for 1200 rupees') === 'bought a shirt for 1200 rupees');
}

section('manglish: query normalization');
{
  const q = (text: string) => normalizeQuery(text);

  check('yesterday', q('innale entha chelavaayathu').text.includes('yesterday'), q('innale entha chelavaayathu').text);
  check('and the spending word', /spend|expense/.test(q('innale entha chelavaayathu').text));
  check('last month', q('kazhinja maasam entha chelavaayathu').text.includes('last month'), q('kazhinja maasam entha chelavaayathu').text);
  check('next week', q('adutha aazhcha enthokke undu').text.includes('next week'));
  check('day after tomorrow', q('nale kazhinju dentist undu').text.includes('day after tomorrow'), q('nale kazhinju dentist undu').text);
  check('when-questions', q('ente dentist appointment eppozha').text.includes('when'), q('ente dentist appointment eppozha').text);
  check('how much', q('ethra roopa chelavaayi').text.includes('how much'), q('ethra roopa chelavaayi').text);
  check('evening', q('nale vykunneram').text.includes('evening'));
  check('bought', q('njan jacket vaangi').text.includes('bought'));

  check('plain english is left exactly as it was', q('how much did i spend last month').hits === 0);
  check('and is not rewritten', q('how much did i spend last month').text === 'how much did i spend last month');
  check('an english question has nothing unknown', q('what did i buy yesterday').unknown.length === 0, q('what did i buy yesterday').unknown);

  const script = q('ഇന്നലെ എത്ര ചെലവ്');
  check('script is noticed', script.hadScript === true);
  check('and the common words still translate', script.text.includes('yesterday') && script.text.includes('how much'), script.text);

  const name = q('Rahul oppam Kozhikode poyi');
  check('names are left alone', name.text.includes('rahul') && name.text.includes('kozhikode'), name.text);
  check('and counted as unknown, not translated', name.unknown.includes('kozhikode'));
  check('while the known words are read', name.text.includes('with') && name.text.includes('went'), name.text);
}

section('manglish: dates resolve from the glossary');
{
  // A fixed "now" so these never drift: Tuesday 13 October 2026, 14:00.
  const now = new Date(2026, 9, 13, 14, 0);
  const rangeFor = (question: string) => {
    const normalized = normalizeQuery(question);
    return guessDateRange(normalized.hits > 0 ? normalized.text : question, now);
  };

  const yesterday = rangeFor('innale entha chelavaayathu');
  check('innale is yesterday', yesterday?.label === 'yesterday', yesterday?.label);
  check('and covers that day only', yesterday?.from.getDate() === 12 && yesterday?.to.getDate() === 12);

  check('innu is today', rangeFor('innu enthokke cheythu')?.label === 'today');
  check('kazhinja maasam is last month', rangeFor('kazhinja maasam chelavu')?.label === 'last month', rangeFor('kazhinja maasam chelavu')?.label);
  check('ee maasam is this month', rangeFor('ee maasam chelavu')?.label === 'this month');
  check('kazhinja aazhcha is last week', rangeFor('kazhinja aazhcha enthokke')?.label === 'last week');
  check('a question with no time word has no range', rangeFor('dentist appointment eppozha') === null);
  check('english still works exactly as before', rangeFor('what did i spend last month')?.label === 'last month');
}

section('manglish: translating only when it is needed');
{
  const english = normalizeQuery('how much did i spend last month');
  const manglish = normalizeQuery('kazhinja maasam entha chelavaayathu');
  const script = normalizeQuery('ഇന്നലെ ഞാൻ എന്താണ് വാങ്ങിയത്');
  const strange = normalizeQuery('enthokke sambhavichu avide pinne');

  check('a question that found something never costs a call', needsTranslation(script, 3) === false);
  check('plain english that found nothing still costs nothing', needsTranslation(english, 0) === false);
  check('manglish the glossary read, that found nothing, costs nothing', needsTranslation(manglish, 0) === false);
  check('script that found nothing is worth one call', needsTranslation(script, 0) === true);
  check('unreadable manglish that found nothing is worth one call', needsTranslation(strange, 0) === true, strange.unknown);
  check(
    'a single strange word is a name, not a reason to translate',
    needsTranslation(normalizeQuery('Kozhikode poyi'), 0) === false
  );
}

section('spellings across scripts');
{
  const known = [
    { heard: spellingKey('രാഹുൽ'), correct: 'Rahul' },
    { heard: spellingKey('Rahool'), correct: 'Rahul' },
  ];
  check('script keeps its own key', spellingKey('രാഹുൽ').length > 0);
  check('two script names do not collapse together', spellingKey('രാഹുൽ') !== spellingKey('കോഴിക്കോട്'));
  check('the script form resolves to the canonical name', lookupSpelling('രാഹുൽ', known) === 'Rahul');
  check('so does a misheard latin form', lookupSpelling('Rahool', known) === 'Rahul');
  check('the canonical name needs no change', lookupSpelling('Rahul', known) === null);

  // A later correction of the canonical name moves everything with it.
  const chained = [...known, { heard: spellingKey('Rahul'), correct: 'Rahul Menon' }];
  check('an alias follows the chain to the newest spelling', lookupSpelling('രാഹുൽ', chained) === 'Rahul Menon');
  check('and a loop cannot hang it', lookupSpelling('A', [{ heard: spellingKey('A'), correct: 'B' }, { heard: spellingKey('B'), correct: 'A' }]) !== undefined);
}

section('instructions: telling one from a question');
{
  check('an english order is one', looksLikeCommand('mark the dentist done') === true);
  check('so is adding something', looksLikeCommand('add gym tomorrow at 6') === true);
  check('a question is not', looksLikeCommand('what did i spend last month') === false);
  check('nor is one without a question mark', looksLikeCommand('how much is left in groceries') === false);

  check(
    'a politely-phrased order is still one',
    looksLikeCommand('can you change the priority set to high for the chair parcel') === true
  );
  check('so is "could you"', looksLikeCommand('could you move the gym reminder to friday') === true);
  check(
    'but "can you" asking something stays a question',
    looksLikeCommand('can you tell me what i spent on food') === false
  );

  check('manglish puts its verb last', looksLikeCommand('dentist nale maattu') === true);
  check('and finished is an order', looksLikeCommand('gym kazhinju') === true);
  check('so is adding', looksLikeCommand('nale meeting cherkku') === true);
  check('so is deleting', looksLikeCommand('aa entry delete cheyyu') === true);
  check('script works too', looksLikeCommand('ഡെന്റിസ്റ്റ് മാറ്റു') === true);

  check('a manglish question is still a question', looksLikeCommand('innale entha chelavaayathu') === false);
  check('and so is asking when', looksLikeCommand('dentist appointment eppozha') === false);
  check('the day after tomorrow is not "done"', looksLikeCommand('nale kazhinju dentist undu') === false);
}

section('instructions: what the app refuses');
{
  const now = new Date('2026-10-15T09:00:00+05:30');
  const open = memory({
    id: 'm1',
    title: 'Dentist appointment',
    eventDate: '2026-10-20T10:00:00+05:30',
    dateExpression: 'next Tuesday at 10',
    type: 'appointment',
    priority: 'low',
  });
  const expense: ExpenseTarget = {
    id: 'e1',
    amount: 500,
    cat_name: 'Food',
    category_id: 'c1',
    note: 'Dinner',
    date: '2026-10-14',
  };
  const candidates = {
    memories: [open],
    expenses: [expense],
    expenseCategories: ['Food', 'Travel'],
  };

  const unknownId = validateActions(
    [{ kind: 'mark_done', entryId: 'M9' }],
    candidates,
    now
  );
  check('an id it was never shown is refused', unknownId.actions.length === 0, unknownId.refused);
  check('and says why', unknownId.refused.length === 1, unknownId.refused);

  const unknownKind = validateActions([{ kind: 'send_email', entryId: 'm1' }], candidates, now);
  check('a kind that does not exist is refused', unknownKind.actions.length === 0);

  const past = validateActions(
    [{ kind: 'reschedule_entry', entryId: 'm1', newDate: '2026-10-01' }],
    candidates,
    now
  );
  check('a date already gone is refused', past.actions.length === 0, past.refused);

  const askedForPast = validateActions(
    [{ kind: 'reschedule_entry', entryId: 'm1', newDate: '2026-10-01' }],
    candidates,
    now,
    true
  );
  check('unless it was plainly asked for', askedForPast.actions.length === 1);

  const badPriority = validateActions(
    [{ kind: 'change_priority', entryId: 'm1', newPriority: 'urgent' }],
    candidates,
    now
  );
  check('a priority that is not one is refused', badPriority.actions.length === 0);

  const badAmount = validateActions(
    [{ kind: 'edit_amount', expenseId: 'e1', newAmount: -5 }],
    candidates,
    now
  );
  check('a negative amount is refused', badAmount.actions.length === 0);

  const strangeCategory = validateActions(
    [{ kind: 'change_category', expenseId: 'e1', newCategory: 'Yachts' }],
    candidates,
    now
  );
  check('a category nobody has is refused', strangeCategory.actions.length === 0);

  const entryCategory = validateActions(
    [{ kind: 'change_category', entryId: 'm1', newCategory: 'Food' }],
    candidates,
    now
  );
  check('and an entry cannot take an expense category', entryCategory.actions.length === 0, entryCategory.refused);

  const emptyAdd = validateActions([{ kind: 'add_entry', text: '  ' }], candidates, now);
  check('adding nothing is refused', emptyAdd.actions.length === 0);
}

section('instructions: the cap on one batch');
{
  const now = new Date('2026-10-15T09:00:00+05:30');
  const many = Array.from({ length: 30 }, (_, index) =>
    memory({ id: `b${index}`, title: `Task ${index}`, eventDate: '2026-10-15T09:00:00+05:30' })
  );
  const result = validateActions(
    [{ kind: 'mark_many_done', entryIds: many.map((m) => m.id) }],
    { memories: many, expenses: [] },
    now
  );
  check('no more than twenty at once', result.actions[0]?.memories.length === MAX_BATCH, result.actions[0]?.memories.length);
  check('and it says it was trimmed', result.trimmed === true);
}

section('instructions: what the confirmation card shows');
{
  const now = new Date('2026-10-15T09:00:00+05:30');
  const timed = memory({
    id: 'm1',
    title: 'Dentist appointment',
    eventDate: '2026-10-20T10:00:00+05:30',
    dateExpression: 'next Tuesday at 10',
  });
  const weekly = memory({
    id: 'm2',
    title: 'Gym',
    eventDate: '2026-10-15T06:00:00+05:30',
    repeat: 'weekly',
  });
  const candidates = { memories: [timed, weekly], expenses: [] };

  const moved = validateActions(
    [{ kind: 'reschedule_entry', entryId: 'm1', newDate: '2026-10-23', newTime: '16:30' }],
    candidates,
    now
  ).actions[0];
  const movedChange = describeChange(moved)[0];
  check('the entry is named', movedChange.label === 'Dentist appointment');
  check('the old date is shown', movedChange.before.includes('20'), movedChange.before);
  check('the new one too', movedChange.after.includes('23'), movedChange.after);
  check('and a stated time is kept', movedChange.after.includes('16:30'), movedChange.after);

  const ticked = validateActions([{ kind: 'mark_done', entryId: 'm2' }], candidates, now).actions[0];
  const tickedChange = describeChange(ticked)[0];
  check('ticking off a repeating entry says it comes back', tickedChange.after.includes('weekly'), tickedChange.after);

  check('only a delete cannot be undone', isDestructive(ticked) === false);
  check(
    'and a delete says so',
    isDestructive(validateActions([{ kind: 'delete_entry', entryId: 'm1' }], candidates, now).actions[0]) === true
  );
}

section('instructions: what was changed, and where');
{
  check('one entry', changeLabel({ memories: 1, expenses: 0 }) === 'CHANGED 1 ENTRY');
  check('several', changeLabel({ memories: 3, expenses: 0 }) === 'CHANGED 3 ENTRIES');
  check('one expense', changeLabel({ memories: 0, expenses: 1 }) === 'CHANGED 1 EXPENSE');
  check('both zones at once', changeLabel({ memories: 1, expenses: 2 }) === 'CHANGED 1 ENTRY + 2 EXPENSES');
  check('nothing at all', changeLabel({ memories: 0, expenses: 0 }) === 'NOTHING CHANGED');
}

section('instructions: undo puts back exactly what changed');
{
  const before = snapshot(
    memory({
      id: 'm1',
      title: 'Gym',
      eventDate: '2026-10-15T06:00:00+05:30',
      priority: 'high',
      status: 'active',
      amount: 1200,
      category: 'Health',
      repeat: 'weekly',
    })
  );
  const patch = undoPatch(before);
  check('the date comes back', patch.eventDate === '2026-10-15T06:00:00+05:30');
  check('the state comes back', patch.status === 'active');
  check('the priority comes back', patch.priority === 'high');
  check('the amount comes back', patch.amount === 1200);
  check('the category comes back', patch.category === 'Health');
  check('and nothing else is touched', Object.keys(patch).length === 5, Object.keys(patch));
}

section('instructions: corrections and the words that were missed');
{
  check('making something a priority is an order', looksLikeCommand('make the electricity bill high priority') === true);
  check('so is stating the priority', looksLikeCommand('the electricity bill is high priority') === true);
  check('a corrected amount is an order', looksLikeCommand('the dinner at paragon was actually 1450') === true);
  check('so is a replacement', looksLikeCommand("it's 1200 not 1450") === true);
  check('so is a correction to a date', looksLikeCommand('the dentist is actually tomorrow') === true);
  check('renaming is an order', looksLikeCommand('rename it to Ghost of Yotei') === true);
  check('so is cancelling', looksLikeCommand('cancel the gym reminder') === true);

  check('asking which is which is still a question', looksLikeCommand('which ones are high priority') === false);
  check('and so is asking what happened', looksLikeCommand('what did i actually spend on food') === false);
  check('a bare remark is not an order', looksLikeCommand('that was a good trip actually') === false);
  check('nor is one with nothing to correct to', looksLikeCommand('it was not great') === false);
}

section('groups: one name holds a job together');
{
  check('spacing is tidied', normalizeGroupName('  Kozhikode   trip ') === 'Kozhikode trip');
  check('an empty name is no group', normalizeGroupName('   ') === null);
  check('and so is nothing at all', normalizeGroupName(null) === null);
  check('the words are kept as written', normalizeGroupName('Work') === 'Work');
  check('a very long name is cut', (normalizeGroupName('x'.repeat(200)) ?? '').length === 60);

  check('case does not make a second group', sameGroup('Work', 'work') === true);
  check('different names are different groups', sameGroup('Work', 'Home') === false);
  check('nothing matches nothing', sameGroup(null, null) === false);
}

section('groups: what each one has left');
{
  const now = new Date('2026-10-16T09:00:00+05:30');
  const trip = [
    memory({ id: 'g1', title: 'Book tickets', eventDate: '2026-10-14T09:00:00+05:30', groupName: 'Kozhikode trip', status: 'done' }),
    memory({ id: 'g2', title: 'Pack bags', eventDate: '2026-10-18T09:00:00+05:30', groupName: 'Kozhikode trip' }),
    memory({ id: 'g3', title: 'Get cash', eventDate: '2026-10-15T09:00:00+05:30', groupName: 'kozhikode trip' }),
  ];
  const work = [
    memory({ id: 'g4', title: 'Send the invoice', eventDate: '2026-10-20T09:00:00+05:30', groupName: 'Work' }),
  ];
  const over = [
    memory({ id: 'g5', title: 'Return the car', eventDate: '2026-10-01T09:00:00+05:30', groupName: 'Goa trip', status: 'done' }),
  ];
  const loose = [memory({ id: 'g6', title: 'Buy milk', eventDate: '2026-10-16T09:00:00+05:30' })];

  const groups = groupSummaries([...trip, ...work, ...over, ...loose], now);

  check('one group per name', groups.length === 3, groups.map((g) => g.name));
  check('an ungrouped entry is in none of them', groups.every((g) => g.name !== 'Buy milk'));
  check('case differences fold together', groups.find((g) => g.name === 'Kozhikode trip')?.total === 3);
  check('the first spelling is the one shown', groups.some((g) => g.name === 'Kozhikode trip'));

  const kozhikode = groups.find((g) => g.name === 'Kozhikode trip');
  check('finished ones are counted', kozhikode?.done === 1);
  check('and so is what is left', kozhikode?.open === 2);
  check('overdue work is counted', kozhikode?.overdue === 1, kozhikode?.overdue);
  check('the next due date is the soonest open one', kozhikode?.nextDue?.startsWith('2026-10-15') === true, kozhikode?.nextDue);
  check('progress is the share finished', Math.round((kozhikode?.progress ?? 0) * 100) === 33);

  check('the group with overdue work comes first', groups[0]?.name === 'Kozhikode trip', groups.map((g) => g.name));
  check('a finished group sinks to the bottom', groups[groups.length - 1]?.name === 'Goa trip');
  check('a finished group reads as done', groups[groups.length - 1]?.progress === 1);

  const members = membersOf([...trip, ...work, ...loose], 'KOZHIKODE TRIP');
  check('a group reads back whatever the case', members.length === 3);
  check('unfinished work comes first, soonest first', members[0]?.title === 'Get cash', members.map((m) => m.title));
  check('and what is done is last', members[members.length - 1]?.title === 'Book tickets');

  check('the names offered are the ones in use', groupNames([...trip, ...work]).includes('Work'));
  check('and nothing else', groupNames(loose).length === 0);
}

section('groups: several tasks out of one line');
{
  check('commas separate them', splitTasks('book tickets, pack bags, get cash').length === 3);
  check('so do new lines', splitTasks('book tickets\npack bags').length === 2);
  check('so do semicolons', splitTasks('book tickets; pack bags').length === 2);
  check('spacing is tidied', splitTasks('  book   tickets ,  pack bags ')[0] === 'book tickets');

  check('one line with "and" splits', splitTasks('book tickets and pack bags').length === 2);
  check(
    'but "and" inside a listed item is left alone',
    splitTasks('fish and chips, pack bags').length === 2,
    splitTasks('fish and chips, pack bags')
  );
  check('one plain task stays one', splitTasks('pack bags').length === 1);
  check('nothing typed is nothing added', splitTasks('   ').length === 0);
  check('the same thing twice is added once', splitTasks('pack bags, Pack Bags').length === 1);

  const many = Array.from({ length: 40 }, (_, i) => `task ${i}`).join(', ');
  check('a flood is capped', splitTasks(many).length === MAX_TASKS_AT_ONCE);
}

section('groups: a group that exists before its work does');
{
  const now = new Date('2026-10-16T09:00:00+05:30');
  const entries = [
    memory({ id: 'e1', title: 'Send the invoice', eventDate: '2026-10-20T09:00:00+05:30', groupName: 'Work' }),
  ];

  const groups = groupSummaries(entries, now, ['House move']);
  check('a group with nothing in it still exists', groups.some((g) => g.name === 'House move'));
  check('and reads as empty', groups.find((g) => g.name === 'House move')?.total === 0);
  check('it is not mistaken for finished', groups[groups.length - 1]?.name !== 'House move', groups.map((g) => g.name));

  const both = groupSummaries(entries, now, ['Work']);
  check('a name that is also in use does not double up', both.filter((g) => g.name === 'Work').length === 1);
  check('and keeps its entries', both.find((g) => g.name === 'Work')?.total === 1);

  const named = groupSummaries(entries, now, ['work']);
  check('the deliberate spelling wins', named.find((g) => g.total === 1)?.name === 'work');

  check('empty groups are offered in the picker', groupNames(entries, ['House move']).includes('House move'));

  const finished = [
    memory({ id: 'e2', title: 'Return the keys', eventDate: '2026-10-01T09:00:00+05:30', groupName: 'Goa trip', status: 'done' }),
  ];
  const mixed = groupSummaries([...entries, ...finished], now, ['House move']);
  check('a finished group still sinks below an empty one', mixed[mixed.length - 1]?.name === 'Goa trip', mixed.map((g) => g.name));
}

section('typed tasks: reading the date out of the line');
{
  // Friday 16 October 2026, 11:00 in the morning.
  const now = new Date(2026, 9, 16, 11, 0, 0, 0);
  const read = (text: string) => parseWhen(text, now);
  const at = (text: string) => {
    const when = read(text).eventDate;
    return when ? new Date(when) : null;
  };

  {
    const result = read('table parcel by tomorrow 9am');
    check('the title loses the date words', result.title === 'Table parcel', result.title);
    check('the day is tomorrow', at('table parcel by tomorrow 9am')?.getDate() === 17);
    check('the hour is the one stated', at('table parcel by tomorrow 9am')?.getHours() === 9);
    check('and the minutes are zero', at('table parcel by tomorrow 9am')?.getMinutes() === 0);
    check('what was said is kept', result.dateExpression === 'tomorrow 9am', result.dateExpression);
    check('so the time shows rather than hides', hasStatedTime(result.dateExpression) === true);
  }

  check('today stays today', at('call the bank today')?.getDate() === 16);
  check('tonight is this evening', at('pack the bags tonight')?.getHours() === 20);
  check('the day after tomorrow is two days on', at('dentist day after tomorrow')?.getDate() === 18);
  check('next week is seven days on', at('review next week')?.getDate() === 23);
  check('in three days counts them', at('follow up in 3 days')?.getDate() === 19);
  check('in two weeks too', at('renew in 2 weeks')?.getDate() === 30);

  check('a weekday means the next one', at('gym monday')?.getDate() === 19);
  check('this friday is today when it is friday', at('report this friday')?.getDate() === 16);
  check('a bare friday is the next one', at('report friday')?.getDate() === 23);

  check('a date with a month is read', at('pay rent 5 november')?.getMonth() === 10);
  check('and the day with it', at('pay rent 5 november')?.getDate() === 5);
  check('the month can come first', at('pay rent november 5')?.getDate() === 5);
  check('a month already past means next year', at('party january 5')?.getFullYear() === 2027);

  check('half past is read', at('call at 9:30pm')?.getHours() === 21);
  check('with its minutes', at('call at 9:30pm')?.getMinutes() === 30);
  check('midday is noon', at('lunch at noon')?.getHours() === 12);
  check('the morning is nine', at('tomorrow morning walk')?.getHours() === 9);
  check('the evening is six', at('tomorrow evening call')?.getHours() === 18);

  check('a bare small hour is the afternoon', at('meeting at 5')?.getHours() === 17);
  check('a bare large hour is taken as written', at('meeting at 9')?.getHours() === 9);
  check('midnight is zero', at('deadline at midnight')?.getHours() === 0);

  {
    // A time with no day: today while it is ahead, tomorrow once it is past.
    const ahead = at('call at 3pm');
    check('a time still ahead is today', ahead?.getDate() === 16 && ahead?.getHours() === 15);
    const past = at('call at 10am');
    check('a time already gone is tomorrow', past?.getDate() === 17 && past?.getHours() === 10);
  }

  {
    const plain = read('table parcel');
    check('a line with no date keeps every word', plain.title === 'Table parcel');
    check('and gets no date at all', plain.eventDate === null);
    check('nor any wording', plain.dateExpression === null);
  }

  check('a date with no time lands at nine', at('pack bags tomorrow')?.getHours() === 9);
  check('and that time is not claimed as stated', hasStatedTime(read('pack bags tomorrow').dateExpression) === false);

  check('words that only look like dates are left', read('may the best win').title === 'May the best win');
  check('an "at" that is part of the title stays', read('meet at the cafe tomorrow').title === 'Meet at the cafe tomorrow'.replace(' tomorrow', ''), read('meet at the cafe tomorrow').title);

  // Malayalam written in English letters, the way the rest of the app reads it.
  check('nale is tomorrow', at('table parcel nale')?.getDate() === 17);
  check('innu is today', at('bank call innu')?.getDate() === 16);
  check('and the title survives it', read('table parcel nale').title === 'Table parcel');
}

section('typed tasks: today without a time is not already late');
{
  const morning = new Date(2026, 9, 16, 7, 15, 0, 0);
  const afternoon = new Date(2026, 9, 16, 13, 14, 0, 0);
  const night = new Date(2026, 9, 16, 23, 50, 0, 0);

  check('before nine, it is nine', dueToday(morning).getHours() === 9 && dueToday(morning).getMinutes() === 0);
  check('after nine, it is still ahead', dueToday(afternoon).getTime() > afternoon.getTime());
  check('and only minutes ahead', dueToday(afternoon).getTime() - afternoon.getTime() <= 60 * 60000);
  check('landing on a half hour', dueToday(afternoon).getMinutes() === 30, dueToday(afternoon).getMinutes());
  check('late at night it rolls over the hour', dueToday(night).getHours() === 0 && dueToday(night).getDate() === 17);

  // The bug: three tasks added at one in the afternoon read "2 overdue".
  // A line with no date of its own gets none here — the caller falls back to
  // dueToday, which is what must not be a time already gone.
  const added = parseWhen('get cash from the ATM', afternoon);
  check('a line with no date words is left alone', added.eventDate === null);
  check('and what it falls back to is still ahead', dueToday(afternoon).getTime() > afternoon.getTime());
  check('but is still today', dueToday(afternoon).getDate() === 16);

  const stated = parseWhen('call the bank today', afternoon);
  check('saying "today" is the same', new Date(stated.eventDate!).getTime() > afternoon.getTime());

  const earlier = parseWhen('call the bank today', morning);
  check('and before nine it is nine', new Date(earlier.eventDate!).getHours() === 9);

  const tomorrow = parseWhen('pack bags tomorrow', afternoon);
  check('another day keeps the nine', new Date(tomorrow.eventDate!).getHours() === 9);

  const timed = parseWhen('dinner at 8pm', afternoon);
  check('a stated time is left exactly as stated', new Date(timed.eventDate!).getHours() === 20);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
