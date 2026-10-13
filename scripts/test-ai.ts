/**
 * Live checks against the Gemini API. Costs real tokens.
 *
 *   GEMINI_API_KEY=... npm run test:ai
 *
 * Covers build-order step 3 (extraction shape for each example sentence) and
 * step 6 (grounded answers, including the must-say-not-found case).
 */
import { askAI } from '../src/ai/ask';
import { hasApiKey } from '../src/ai/client';
import { extractMemories } from '../src/ai/extract';
import type { Memory, MemoryDraft } from '../src/types';

if (!hasApiKey()) {
  console.error(
    'No API key. Run with GEMINI_API_KEY=... (or EXPO_PUBLIC_GEMINI_API_KEY).'
  );
  process.exit(1);
}

const NOW = new Date().toISOString();

/** Free-tier Gemini allows ~20 requests/min, so pace the suite. */
const PACE_MS = 4000;
const pace = () => new Promise((done) => setTimeout(done, PACE_MS));

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

function show(drafts: MemoryDraft[]) {
  for (const draft of drafts) {
    const bits = [
      draft.type,
      draft.category,
      new Date(draft.eventDate).toDateString(),
      draft.amount !== null ? `${draft.currency} ${draft.amount}` : null,
      draft.dateExpression ? `said "${draft.dateExpression}"` : null,
      draft.location,
    ].filter(Boolean);
    console.log(`        · ${draft.title}  [${bits.join(' | ')}]`);
  }
}

async function main() {
  console.log('\n=== Extraction ===\n');

  const cases: Array<{
    name: string;
    text: string;
    assert: (drafts: MemoryDraft[]) => void;
  }> = [
    {
      name: 'haircut',
      text: 'I got my haircut today',
      assert: (d) => {
        check('haircut: one event', d.length === 1, d.length);
        check('haircut: type memory', d[0]?.type === 'memory', d[0]?.type);
        check(
          'haircut: Personal Care',
          d[0]?.category === 'Personal Care',
          d[0]?.category
        );
        check('haircut: no invented amount', d[0]?.amount === null, d[0]?.amount);
      },
    },
    {
      name: 'purchase',
      text: 'Bought AirPods for 18000 rupees yesterday',
      assert: (d) => {
        check('purchase: type purchase', d[0]?.type === 'purchase', d[0]?.type);
        check('purchase: amount 18000', d[0]?.amount === 18000, d[0]?.amount);
        check('purchase: INR', d[0]?.currency === 'INR', d[0]?.currency);
        check(
          'purchase: resolved to yesterday',
          new Date(d[0].eventDate).toDateString() ===
            new Date(Date.now() - 86400000).toDateString(),
          d[0]?.eventDate
        );
        check(
          'purchase: kept the phrase',
          (d[0]?.dateExpression ?? '').toLowerCase().includes('yesterday'),
          d[0]?.dateExpression
        );
      },
    },
    {
      name: 'task',
      text: 'I need to submit my tax documents',
      assert: (d) => {
        check('task: type task', d[0]?.type === 'task', d[0]?.type);
      },
    },
    {
      name: 'reminder',
      text: 'Remind me to renew my passport next month',
      assert: (d) => {
        check('reminder: type reminder', d[0]?.type === 'reminder', d[0]?.type);
      },
    },
    {
      name: 'appointment',
      text: 'Dentist appointment on Friday at 4pm',
      assert: (d) => {
        check(
          'appointment: type appointment',
          d[0]?.type === 'appointment',
          d[0]?.type
        );
        check('appointment: Health', d[0]?.category === 'Health', d[0]?.category);
        check(
          'appointment: in the future',
          new Date(d[0].eventDate).getTime() > Date.now(),
          d[0]?.eventDate
        );
      },
    },
    {
      name: 'multi-event',
      text: 'I went to Kozhikode yesterday and bought a shirt for 1200 rupees',
      assert: (d) => {
        check('multi: two events', d.length === 2, d.length);
        check(
          'multi: has a travel event',
          d.some((m) => m.category === 'Travel'),
          d.map((m) => m.category)
        );
        check(
          'multi: has a 1200 purchase',
          d.some((m) => m.type === 'purchase' && m.amount === 1200),
          d.map((m) => `${m.type}:${m.amount}`)
        );
        check(
          'multi: mentions Kozhikode',
          d.some((m) => (m.location ?? '').toLowerCase().includes('kozhikode')),
          d.map((m) => m.location)
        );
      },
    },
    {
      name: 'no-fabrication',
      text: 'I went for a walk',
      assert: (d) => {
        check('walk: no invented amount', d[0]?.amount === null, d[0]?.amount);
        check('walk: no invented people', d[0]?.people === null, d[0]?.people);
        check('walk: no invented location', d[0]?.location === null, d[0]?.location);
      },
    },
  ];

  for (const testCase of cases) {
    console.log(`  "${testCase.text}"`);
    try {
      await pace();
      const drafts = await extractMemories(testCase.text, NOW);
      show(drafts);
      testCase.assert(drafts);
    } catch (err) {
      failed++;
      console.log(`  FAIL  ${testCase.name} threw:`, (err as Error).message);
    }
    console.log('');
  }

  console.log('=== Ask (grounded answering) ===\n');

  // A fixed corpus so the assertions are deterministic.
  const days = (n: number) =>
    new Date(Date.now() - n * 86400000).toISOString();

  let seq = 0;
  const m = (partial: Partial<Memory> & { title: string; eventDate: string }): Memory => {
    seq += 1;
    return {
      id: `m${seq}`,
      rawInput: partial.title,
      type: 'memory',
      category: 'Other',
      dateExpression: null,
      createdAt: partial.eventDate,
      updatedAt: partial.eventDate,
      amount: null,
      currency: null,
      people: null,
      location: null,
      tags: null,
      priority: null,
      status: 'active',
      confirmed: true,
      repeat: null,
      ...partial,
    };
  };

  const corpus: Memory[] = [
    m({ title: 'Got my haircut', eventDate: days(12), category: 'Personal Care', tags: 'haircut' }),
    m({ title: 'Got my haircut', eventDate: days(54), category: 'Personal Care', tags: 'haircut' }),
    m({ title: 'Got my haircut', eventDate: days(96), category: 'Personal Care', tags: 'haircut' }),
    m({ title: 'Bought AirPods', eventDate: days(6), category: 'Shopping', type: 'purchase', amount: 18000, currency: 'INR', tags: 'electronics' }),
    m({ title: 'Bought a laptop charger', eventDate: days(30), category: 'Shopping', type: 'purchase', amount: 2400, currency: 'INR', tags: 'electronics' }),
  ];

  {
    await pace();
    const r = await askAI('When did I last cut my hair?', NOW, corpus);
    console.log(`  Q: When did I last cut my hair?\n  A: ${r.answer}`);
    console.log(`     evidence: ${r.evidence.map((e) => e.title).join(', ') || '(none)'}\n`);
    check('haircut question found', r.found);
    check('haircut cites evidence', r.evidence.length > 0);
    check(
      'haircut cites the most recent one',
      r.evidence.some((e) => e.id === corpus[0].id),
      r.evidence.map((e) => e.id)
    );
  }

  {
    await pace();
    const r = await askAI('How much did I spend on electronics?', NOW, corpus);
    console.log(`  Q: How much did I spend on electronics?\n  A: ${r.answer}`);
    console.log(`     evidence: ${r.evidence.map((e) => e.title).join(', ') || '(none)'}\n`);
    check('spend question found', r.found);
    check('spend answer totals 20400', r.answer.includes('20,400') || r.answer.includes('20400'), r.answer);
    check('spend cites both purchases', r.evidence.length === 2, r.evidence.length);
  }

  {
    await pace();
    const r = await askAI('How often do I cut my hair?', NOW, corpus);
    console.log(`  Q: How often do I cut my hair?\n  A: ${r.answer}`);
    console.log(`     evidence: ${r.evidence.map((e) => e.title).join(', ') || '(none)'}\n`);
    check('frequency question found', r.found);
    check('frequency cites multiple events', r.evidence.length >= 2, r.evidence.length);
  }

  {
    // The critical negative case: nothing recorded about this.
    await pace();
    const r = await askAI('When did I last go scuba diving?', NOW, corpus);
    console.log(`  Q: When did I last go scuba diving?\n  A: ${r.answer}`);
    console.log(`     evidence: ${r.evidence.map((e) => e.title).join(', ') || '(none)'}\n`);
    check('unrecorded question returns not-found', r.found === false, r.found);
    check('unrecorded question cites nothing', r.evidence.length === 0, r.evidence.length);
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nTest run crashed:', err);
  process.exit(1);
});
