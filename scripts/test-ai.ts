/**
 * Live checks against the Gemini API. Costs real tokens.
 *
 *   GEMINI_API_KEY=... npm run test:ai
 *
 * Covers build-order step 3 (extraction shape for each example sentence) and
 * step 6 (grounded answers, including the must-say-not-found case).
 */
import { askAI } from '../src/ai/ask';
import { ASK_MODEL, requestJson } from '../src/ai/client';
import {
  buildUserMessage,
  COMMAND_SCHEMA,
  planFromReply,
  renderCandidates,
  SYSTEM_PROMPT,
} from '../src/ai/commandPlan';
import type { ExpenseRow } from '../src/expense/db';
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
      endDate: null,
      groupName: null,
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


  console.log('\n=== Instructions (the Ask box changing things) ===\n');

  {
    const targets: Memory[] = [
      m({ id: 'i1', title: 'Pay the electricity bill', eventDate: days(2), type: 'task', priority: 'low' }),
      m({ id: 'i2', title: 'Dentist appointment', eventDate: days(-4), type: 'appointment', dateExpression: 'next Tuesday at 10' }),
      m({ id: 'i3', title: 'Gym', eventDate: days(0), type: 'reminder', repeat: 'weekly' }),
    ];
    const expenses: ExpenseRow[] = [
      {
        id: 'x1', amount: 1200, category_id: 'c1', date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
        note: 'Dinner at Paragon', notes: '', method: 'Card', user_tag: '', recurring_id: null,
        cat_name: 'Food', cat_icon: 'food', cat_color: '#222', item_count: 0,
      },
    ];
    const categories = ['Food', 'Travel', 'Bills'];

    /** Plan one instruction the way the Ask tab does, minus the database. */
    const planned = async (instruction: string) => {
      const refs = renderCandidates(targets, expenses);
      const body = await requestJson({
        model: ASK_MODEL,
        system: SYSTEM_PROMPT,
        user: buildUserMessage({
          instruction,
          nowISO: NOW,
          memories: refs.renderedMemories,
          expenses: refs.renderedExpenses,
          categories,
        }),
        schemaName: 'command_plan',
        schema: COMMAND_SCHEMA,
        retries: 0,
      });
      return planFromReply(body, {
        instruction,
        now: new Date(NOW),
        memories: targets,
        expenses,
        categories,
        memoryByRef: refs.memoryByRef,
        expenseByRef: refs.expenseByRef,
      });
    };

    const shown = (plan: Awaited<ReturnType<typeof planned>>) => {
      if (!plan) return '(no plan)';
      if ('question' in plan) return `clarify: ${plan.question}`;
      if ('refusedOnly' in plan) return `refused: ${plan.refusedOnly.join(' ')}`;
      return plan.changes.map((c) => `${c.label}: ${c.before} -> ${c.after}`).join('; ');
    };

    {
      await pace();
      const plan = await planned('make the electricity bill high priority');
      console.log(`  I: make the electricity bill high priority\n  ->  ${shown(plan)}\n`);
      const ok = plan && !('question' in plan) && !('refusedOnly' in plan);
      check('a priority instruction proposes a change', !!ok);
      check(
        'and it is the right entry, low to high',
        !!ok && plan.changes.some((c) => c.label.includes('electricity') && c.after === 'high'),
        shown(plan)
      );
    }

    {
      // A correction, which opens with no verb at all.
      await pace();
      const plan = await planned('the dinner at paragon was actually 1450');
      console.log(`  I: the dinner at paragon was actually 1450\n  ->  ${shown(plan)}\n`);
      const ok = plan && !('question' in plan) && !('refusedOnly' in plan);
      check('a corrected amount proposes a change', !!ok);
      check(
        'and it shows both figures',
        !!ok && plan.changes.some((c) => c.before === '1200' && c.after === '1450'),
        shown(plan)
      );
    }

    {
      // Ticking off something that repeats must say it comes back.
      await pace();
      const plan = await planned('gym kazhinju');
      console.log(`  I: gym kazhinju\n  ->  ${shown(plan)}\n`);
      const ok = plan && !('question' in plan) && !('refusedOnly' in plan);
      check('a Manglish instruction proposes a change', !!ok);
      check(
        'and a repeating entry says it comes round again',
        !!ok && plan.changes.some((c) => c.after.toLowerCase().includes('weekly')),
        shown(plan)
      );
    }

    {
      // A question must never become a change.
      await pace();
      const plan = await planned('how much did i spend on food');
      console.log(`  I: how much did i spend on food\n  ->  ${shown(plan)}\n`);
      check('a question proposes nothing', plan === null || 'question' in plan || 'refusedOnly' in plan, shown(plan));
    }
  }

  console.log('\n=== Groups ===\n');

  {
    await pace();
    const drafts = await extractMemories(
      'for the Kozhikode trip: book tickets, pack bags and get cash from the ATM',
      NOW
    );
    show(drafts);
    check('a named checklist becomes several entries', drafts.length >= 3, drafts.length);
    const names = new Set(drafts.map((d) => (d.groupName ?? '').toLowerCase()));
    check('all under one group', names.size === 1, [...names]);
    check('named after what the person called it', [...names][0]?.includes('kozhikode'), [...names][0]);
  }

  {
    await pace();
    const drafts = await extractMemories('bought milk for 60 rupees', NOW);
    show(drafts);
    check('one thing on its own gets no group', drafts.every((d) => d.groupName === null), drafts.map((d) => d.groupName));
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nTest run crashed:', err);
  process.exit(1);
});
