import type { Memory } from '../types';
import { localTimestamp } from '../format';
import { deleteMemories, updateMemory } from '../db/queries';
import { completeMemory, reopenMemory } from '../complete';
import { deleteExpense, type ExpenseRow } from '../expense/db';
import { ASK_MODEL, requestJson } from './client';
import { MAX_CONTEXT_MEMORIES, selectRelevantMemories } from './retrieval';
import { renderMemory } from './ask';

export type CommandAction =
  | 'complete'
  | 'reopen'
  | 'push'
  | 'delete_memories'
  | 'delete_expenses'
  | 'set_budget';

export interface CommandPlan {
  action: CommandAction;
  /** One line stating exactly what is about to happen. */
  summary: string;
  /** Entries this would change, already resolved from the model's references. */
  memories: Memory[];
  /** Expense rows this would delete, already resolved. */
  expenses: ExpenseRow[];
  /** Whole days to move by, for `push`. */
  days: number;
  /** The new monthly budget, for `set_budget`. */
  amount: number;
  /** True when running this cannot be put back afterwards. */
  destructive: boolean;
}

export interface CommandOutcome {
  summary: string;
  /** Present only when the change can be reversed. */
  undo: (() => Promise<void>) | null;
}

/** What the screen must lend the executor, because it owns the live settings. */
export interface CommandDeps {
  currentBudget: number;
  setBudget: (value: number) => void;
}

export { looksLikeCommand } from './commandGate';

const COMMAND_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: [
        'complete',
        'reopen',
        'push',
        'delete_memories',
        'delete_expenses',
        'set_budget',
        'none',
      ],
      description: 'The single operation the instruction asks for, or "none".',
    },
    memoryIds: {
      type: 'array',
      description: 'Reference ids (e.g. "M3") of every entry the instruction applies to.',
      items: { type: 'string' },
    },
    expenseIds: {
      type: 'array',
      description: 'Reference ids (e.g. "E2") of every expense the instruction applies to.',
      items: { type: 'string' },
    },
    days: {
      type: ['number', 'null'],
      description: 'For "push": whole days to move by. Tomorrow is 1. Null otherwise.',
    },
    amount: {
      type: ['number', 'null'],
      description: 'For "set_budget": the new monthly budget as a plain number. Null otherwise.',
    },
    summary: {
      type: 'string',
      description: 'One short sentence stating exactly what will happen, in the second person.',
    },
  },
  required: ['action', 'memoryIds', 'expenseIds', 'days', 'amount', 'summary'],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You turn one instruction from a person into exactly one operation on
their own recorded entries. You never answer questions here and you never
invent entries.

The ENTRIES and EXPENSES blocks in the user message are the only things that
exist. Every id you return must be one you were given.

ACTIONS — choose exactly one:
- "complete"         tick entries off: "mark the bank call done", "finished the gym"
- "reopen"           put ticked-off entries back: "reopen the dentist"
- "push"             move entries later by whole days, with "days" set.
                     "push to tomorrow" is 1, "next week" is 7
- "delete_memories"  remove entries from the record for good
- "delete_expenses"  remove expenses for good
- "set_budget"       set the monthly budget, with "amount" as a plain number.
                     "20k" means 20000
- "none"             the instruction is really a question, asks for something
                     none of the above covers, or nothing provided matches it

MATCHING:
- Include every entry the instruction covers and nothing else. "push everything
  from today to tomorrow" means every entry dated today that is still to do.
- "complete" and "push" apply to entries still to do; "reopen" applies to ones
  already done. Never include an entry whose state makes the action meaningless.
- When the instruction names something you cannot find, return "none" with
  empty id lists rather than guessing at the nearest entry.
- Deleting is permanent. Only choose a delete action when the person plainly
  asked to delete, remove, erase or get rid of something — never as a way of
  tidying up or because an entry looks finished.

summary: one short sentence, second person, naming what will change — "Mark 2
entries done." or "Push 3 entries to tomorrow." Never a question, never a
restatement of the instruction.`;

/** One compact line per expense, mirroring how memories are rendered. */
function renderExpense(row: ExpenseRow, ref: string): string {
  const parts = [`[${ref}] ${row.date} | ${row.cat_name} | ${row.method}`, `amount: ${row.amount}`];
  if (row.note) parts.push(`note: ${row.note}`);
  return parts.join('\n  ');
}

function looseJsonParse(raw: string): unknown {
  const text = raw.trim();
  const candidates = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next shape
    }
  }
  return null;
}

const DESTRUCTIVE: CommandAction[] = ['delete_memories', 'delete_expenses'];

/**
 * Work out what an instruction would do, without doing any of it.
 *
 * Returns null whenever this is not a command after all — including when the
 * model decides the words were really a question — so the caller can fall
 * straight through to answering it.
 */
export async function planCommand(
  text: string,
  nowISO: string,
  allMemories: Memory[],
  recentExpenses: ExpenseRow[] = []
): Promise<CommandPlan | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const { memories } =
    allMemories.length > 0
      ? selectRelevantMemories(trimmed, allMemories, new Date(nowISO), MAX_CONTEXT_MEMORIES)
      : { memories: [] as Memory[] };

  if (memories.length === 0 && recentExpenses.length === 0) return null;

  const memoryByRef = new Map<string, Memory>();
  const renderedMemories = memories.map((memory, index) => {
    const ref = `M${index + 1}`;
    memoryByRef.set(ref, memory);
    return renderMemory(memory, ref);
  });

  const expenseByRef = new Map<string, ExpenseRow>();
  const renderedExpenses = recentExpenses.map((row, index) => {
    const ref = `E${index + 1}`;
    expenseByRef.set(ref, row);
    return renderExpense(row, ref);
  });

  const now = new Date(nowISO);
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });

  const body = await requestJson({
    model: ASK_MODEL,
    system: SYSTEM_PROMPT,
    user: [
      `Current local time: ${localTimestamp(nowISO)} (${weekday})`,
      '',
      'ENTRIES:',
      '',
      renderedMemories.join('\n\n') || '(none)',
      '',
      'EXPENSES:',
      '',
      renderedExpenses.join('\n\n') || '(none)',
      '',
      `INSTRUCTION: ${trimmed}`,
    ].join('\n'),
    schemaName: 'command_plan',
    schema: COMMAND_SCHEMA,
  });

  const parsed = looseJsonParse(body) as {
    action?: unknown;
    memoryIds?: unknown;
    expenseIds?: unknown;
    days?: unknown;
    amount?: unknown;
    summary?: unknown;
  } | null;

  if (!parsed || typeof parsed.action !== 'string' || parsed.action === 'none') return null;

  const action = parsed.action as CommandAction;
  if (!['complete', 'reopen', 'push', 'delete_memories', 'delete_expenses', 'set_budget'].includes(action)) {
    return null;
  }

  const targetMemories: Memory[] = [];
  const seenMemories = new Set<string>();
  for (const ref of Array.isArray(parsed.memoryIds) ? parsed.memoryIds : []) {
    if (typeof ref !== 'string') continue;
    const memory = memoryByRef.get(ref.trim().toUpperCase());
    if (memory && !seenMemories.has(memory.id)) {
      seenMemories.add(memory.id);
      targetMemories.push(memory);
    }
  }

  const targetExpenses: ExpenseRow[] = [];
  const seenExpenses = new Set<string>();
  for (const ref of Array.isArray(parsed.expenseIds) ? parsed.expenseIds : []) {
    if (typeof ref !== 'string') continue;
    const row = expenseByRef.get(ref.trim().toUpperCase());
    if (row && !seenExpenses.has(row.id)) {
      seenExpenses.add(row.id);
      targetExpenses.push(row);
    }
  }

  const days = typeof parsed.days === 'number' && Number.isFinite(parsed.days) ? Math.trunc(parsed.days) : 0;
  const amount =
    typeof parsed.amount === 'number' && Number.isFinite(parsed.amount) && parsed.amount >= 0
      ? parsed.amount
      : -1;

  // An action with nothing to act on is not a plan. Setting a budget is the one
  // operation that targets no entries, so it is judged on its amount instead.
  if (action === 'set_budget') {
    if (amount < 0) return null;
  } else if (action === 'delete_expenses') {
    if (targetExpenses.length === 0) return null;
  } else if (targetMemories.length === 0) {
    return null;
  }

  if (action === 'push' && days === 0) return null;

  return {
    action,
    summary:
      typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : 'Apply this change.',
    memories: targetMemories,
    expenses: targetExpenses,
    days,
    amount,
    destructive: DESTRUCTIVE.includes(action),
  };
}

/**
 * Carry out a plan the person has confirmed.
 *
 * Anything reversible snapshots what it is about to change first, so Undo puts
 * the entries back exactly as they were rather than guessing at an inverse —
 * which matters most for a repeating entry, where ticking it off moves its date
 * on rather than closing it.
 */
export async function runCommand(plan: CommandPlan, deps: CommandDeps): Promise<CommandOutcome> {
  const before = plan.memories.map((memory) => ({
    id: memory.id,
    status: memory.status,
    eventDate: memory.eventDate,
  }));

  const restore = async () => {
    for (const snapshot of before) {
      await updateMemory(snapshot.id, {
        status: snapshot.status,
        eventDate: snapshot.eventDate,
      });
    }
  };

  switch (plan.action) {
    case 'complete': {
      for (const memory of plan.memories) await completeMemory(memory);
      return { summary: plan.summary, undo: restore };
    }
    case 'reopen': {
      for (const memory of plan.memories) await reopenMemory(memory);
      return { summary: plan.summary, undo: restore };
    }
    case 'push': {
      for (const memory of plan.memories) {
        const when = new Date(memory.eventDate);
        when.setDate(when.getDate() + plan.days);
        await updateMemory(memory.id, { eventDate: when.toISOString() });
      }
      return { summary: plan.summary, undo: restore };
    }
    case 'delete_memories': {
      await deleteMemories(plan.memories.map((memory) => memory.id));
      return { summary: plan.summary, undo: null };
    }
    case 'delete_expenses': {
      for (const row of plan.expenses) await deleteExpense(row.id);
      return { summary: plan.summary, undo: null };
    }
    case 'set_budget': {
      const previous = deps.currentBudget;
      deps.setBudget(plan.amount);
      return {
        summary: plan.summary,
        undo: async () => {
          deps.setBudget(previous);
        },
      };
    }
  }
}
