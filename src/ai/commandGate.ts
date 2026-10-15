/**
 * Does this read as an instruction rather than a question?
 *
 * Checked on the phone before any model call, so asking things — which is what
 * the Ask box is mostly for — costs exactly what it did before. Only an
 * utterance that opens with an imperative verb, and is not phrased as a
 * question, is worth spending a call on to interpret as a command.
 *
 * Deliberately kept free of imports so it can be exercised on its own.
 */
export function looksLikeCommand(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (t.endsWith('?')) return false;
  if (
    /^(what|when|where|who|why|how|which|did|do|does|is|are|was|were|can|could|should|would|will|am|have|has|tell|show|list|compare)\b/.test(
      t
    )
  ) {
    return false;
  }
  return /^(please\s+|ok\s+|okay\s+|now\s+|just\s+)*(mark|tick|complete|finish|close|reopen|unmark|undo|restore|put\s+back|push|move|postpone|reschedule|snooze|delay|shift|defer|delete|remove|clear|erase|drop|set|change|update)\b/.test(
    t
  );
}
