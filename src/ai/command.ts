import type { Memory } from '../types';
import { deleteMemories, updateMemory } from '../db/queries';
import { completeMemory, reopenMemory } from '../complete';
import {
  deleteExpense,
  findOrCreateCategory,
  getExpense,
  listCategories,
  saveExpense,
  type ExpenseRow,
} from '../expense/db';
import {
  changeLabel,
  countTargets,
  snapshot,
  undoPatch,
  type Change,
  type MemorySnapshot,
  type ValidAction,
} from '../actions';
import { logFail, logOk } from '../log';
import { ASK_MODEL, requestJson } from './client';
import { MAX_CONTEXT_MEMORIES, selectRelevantMemories } from './retrieval';
import {
  buildUserMessage,
  COMMAND_SCHEMA,
  planFromReply,
  renderCandidates,
  SYSTEM_PROMPT,
} from './commandPlan';

/**
 * What one instruction would do, worked out but not done.
 *
 * The model only proposes: by the time a plan exists every id has been matched
 * against the entries that were actually shown to it, every new date has been
 * checked against the clock, and each change can state what it replaces. A
 * plan with nothing left in it is no plan, and the caller answers the question
 * instead.
 */
export interface CommandPlan {
  /** One line stating exactly what is about to happen. */
  summary: string;
  /** The changes that survived checking, ready to apply. */
  actions: ValidAction[];
  /** Before → after for every row the plan touches, for the confirm card. */
  changes: Change[];
  /** True when running this cannot be put back afterwards. */
  destructive: boolean;
  /** Anything the model asked for that was refused, in words. */
  refused: string[];
  /** The batch was trimmed because the instruction reached too far. */
  trimmed: boolean;
  /** A note to capture instead of a change, handed to the review screen. */
  capture: string | null;
  /** The new monthly budget, when that is what was asked for. */
  budget: number | null;
}

/** What the model wants to know before anything can be proposed. */
export interface CommandClarify {
  question: string;
}

export interface CommandOutcome {
  summary: string;
  /** "CHANGED 2 ENTRIES", or both zones when one instruction crossed them. */
  label: string;
  /** Present only when the change can be reversed. */
  undo: (() => Promise<void>) | null;
}

/** What the screen must lend the executor, because it owns the live settings. */
export interface CommandDeps {
  currentBudget: number;
  setBudget: (value: number) => void;
}

export { looksLikeCommand } from './commandGate';


/**
 * Work out what an instruction would do, without doing any of it.
 *
 * Returns null whenever this is not a command after all — including when the
 * model decides the words were really a question — so the caller can fall
 * straight through to answering it. A clarify comes back as a question for the
 * person rather than a plan.
 */
export async function planCommand(
  text: string,
  nowISO: string,
  allMemories: Memory[],
  recentExpenses: ExpenseRow[] = []
): Promise<CommandPlan | CommandClarify | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const { memories } =
    allMemories.length > 0
      ? selectRelevantMemories(trimmed, allMemories, new Date(nowISO), MAX_CONTEXT_MEMORIES)
      : { memories: [] as Memory[] };

  const { memoryByRef, renderedMemories, expenseByRef, renderedExpenses } = renderCandidates(
    memories,
    recentExpenses
  );
  const categories = (await listCategories().catch(() => [])).map((row) => row.name);

  const body = await requestJson({
    model: ASK_MODEL,
    system: SYSTEM_PROMPT,
    user: buildUserMessage({
      instruction: trimmed,
      nowISO,
      memories: renderedMemories,
      expenses: renderedExpenses,
      categories,
    }),
    schemaName: 'command_plan',
    schema: COMMAND_SCHEMA,
  });

  const plan = planFromReply(body, {
    instruction: trimmed,
    now: new Date(nowISO),
    memories,
    expenses: recentExpenses,
    categories,
    memoryByRef,
    expenseByRef,
  });

  if (plan && 'refusedOnly' in plan) {
    logFail('Instruction refused', plan.refusedOnly.join(' '));
    return null;
  }
  return plan;
}

/** What a change was, for the log, so a wrong one can be traced afterwards. */
function changeLine(change: Change): string {
  return `${change.label}: ${change.before} → ${change.after}`;
}

/**
 * Carry out a plan the person has confirmed.
 *
 * Anything reversible snapshots what it is about to change first, so Undo puts
 * the entries back exactly as they were rather than guessing at an inverse —
 * which matters most for a repeating entry, where ticking it off moves its date
 * on rather than closing it. Deleting is the one change that cannot be undone,
 * which is why the confirm card says so before it is pressed.
 */
export async function runCommand(plan: CommandPlan, deps: CommandDeps): Promise<CommandOutcome> {
  if (plan.actions.length === 0 && plan.budget !== null) {
    const previous = deps.currentBudget;
    deps.setBudget(plan.budget);
    logOk('Budget set', `${previous} → ${plan.budget}`);
    return {
      summary: plan.summary,
      label: 'CHANGED THE BUDGET',
      undo: async () => {
        deps.setBudget(previous);
      },
    };
  }

  const memoryBefore = new Map<string, MemorySnapshot>();
  const expenseBefore = new Map<string, { amount: number; category_id: string }>();
  /** Rows a delete took with it: those cannot be restored, the rest can. */
  const gone = new Set<string>();

  for (const action of plan.actions) {
    for (const memory of action.memories) {
      if (!memoryBefore.has(memory.id)) memoryBefore.set(memory.id, snapshot(memory));
    }
    for (const expense of action.expenses) {
      if (!expenseBefore.has(expense.id)) {
        expenseBefore.set(expense.id, { amount: expense.amount, category_id: expense.category_id });
      }
    }
  }

  for (const action of plan.actions) {
    switch (action.kind) {
      case 'reschedule_entry':
        for (const memory of action.memories) {
          await updateMemory(memory.id, { eventDate: action.newDate! });
        }
        break;
      case 'mark_done':
      case 'mark_many_done':
        for (const memory of action.memories) await completeMemory(memory);
        break;
      case 'reopen_entry':
        for (const memory of action.memories) await reopenMemory(memory);
        break;
      case 'change_priority':
        for (const memory of action.memories) {
          await updateMemory(memory.id, { priority: action.newPriority! });
        }
        break;
      case 'edit_amount':
        for (const memory of action.memories) {
          await updateMemory(memory.id, { amount: action.newAmount! });
        }
        for (const expense of action.expenses) {
          await editExpense(expense.id, { amount: action.newAmount! });
        }
        break;
      case 'change_category':
        for (const memory of action.memories) {
          await updateMemory(memory.id, { category: action.newCategory as Memory['category'] });
        }
        for (const expense of action.expenses) {
          await editExpense(expense.id, { categoryId: await findOrCreateCategory(action.newCategory!) });
        }
        break;
      case 'delete_entry':
        for (const memory of action.memories) gone.add(memory.id);
        await deleteMemories(action.memories.map((memory) => memory.id));
        for (const expense of action.expenses) {
          gone.add(expense.id);
          await deleteExpense(expense.id);
        }
        break;
      case 'add_entry':
        // Nothing is written here: the text goes to the review screen, where
        // it is confirmed like any other capture.
        break;
    }
  }

  for (const change of plan.changes) logOk('Changed from Ask', changeLine(change));

  const counts = countTargets(plan.actions);

  // A delete in the batch takes only its own rows out of Undo's reach; a
  // reschedule applied beside it can still be put back.
  const restorable = {
    memories: [...memoryBefore].filter(([id]) => !gone.has(id)),
    expenses: [...expenseBefore].filter(([id]) => !gone.has(id)),
  };
  const undo =
    restorable.memories.length > 0 || restorable.expenses.length > 0
      ? async () => {
          for (const [id, before] of restorable.memories) await updateMemory(id, undoPatch(before));
          for (const [id, before] of restorable.expenses) {
            await editExpense(id, { amount: before.amount, categoryId: before.category_id });
          }
          logOk('Undone', plan.summary);
        }
      : null;

  return { summary: plan.summary, label: changeLabel(counts), undo };
}

/** Change one field of an expense, leaving the rest of the row as it was. */
async function editExpense(
  id: string,
  patch: { amount?: number; categoryId?: string }
): Promise<void> {
  const row = await getExpense(id);
  if (!row) return;
  await saveExpense({
    id: row.id,
    amount: patch.amount ?? row.amount,
    category_id: patch.categoryId ?? row.category_id,
    date: row.date,
    note: row.note,
    notes: row.notes,
    method: row.method,
    user_tag: row.user_tag,
  });
}
