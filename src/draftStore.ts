import { useSyncExternalStore } from 'react';
import type { KeyedDraft, MemoryDraft } from './types';

/**
 * Holds the drafts awaiting confirmation between the capture screen and the
 * preview modal. Router params only carry strings, and these are structured
 * objects the preview edits in place, so they live here instead.
 *
 * Module-level rather than a Context because `nextKey` and the pending raw
 * input also need to survive the modal being pushed.
 */

interface DraftState {
  rawInput: string;
  drafts: KeyedDraft[];
}

let state: DraftState = { rawInput: '', drafts: [] };
const listeners = new Set<() => void>();
let nextKey = 0;

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export function setPendingDrafts(rawInput: string, drafts: MemoryDraft[]) {
  state = {
    rawInput,
    drafts: drafts.map((draft) => ({ key: `d${nextKey++}`, draft })),
  };
  emit();
}

export function updateDraft(key: string, patch: Partial<MemoryDraft>) {
  state = {
    ...state,
    drafts: state.drafts.map((entry) =>
      entry.key === key ? { ...entry, draft: { ...entry.draft, ...patch } } : entry
    ),
  };
  emit();
}

/** Remove one draft — used by both "save" and "discard" on a card. */
export function removeDraft(key: string) {
  state = { ...state, drafts: state.drafts.filter((entry) => entry.key !== key) };
  emit();
}

export function clearDrafts() {
  state = { rawInput: '', drafts: [] };
  emit();
}

export function usePendingDrafts(): DraftState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
