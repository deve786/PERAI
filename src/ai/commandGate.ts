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

/** Malayalam asked in English letters: these open a question, never an order. */
const MANGLISH_QUESTIONS =
  /\b(entha|enthanu|enthaanu|enthokke|enthina|ethra|eppo|eppol|eppozha|eppozhanu|evide|evideya|aara|aaranu|aarkka|engane|undo)\b/;

/**
 * Malayalam command words, looked for anywhere in the sentence rather than at
 * the front: Malayalam puts its verb last, so "dentist nale maattu" carries
 * the instruction in its final word.
 */
const MANGLISH_COMMANDS =
  /\b(maattu|maatti|maattuka|mattu|matti|mattuka|aakku|aakkuka|kazhinju|kazhinjhu|theernnu|theerthu|cheyyu|cheythekku|cherkku|cherkkuka|kalayu|kalanju|ozhivakku)\b/;

/** The same words in their own script, for a phone set to Malayalam. */
const SCRIPT_COMMANDS =
  /(മാറ്റു|മാറ്റുക|മാറ്റി|ആക്കു|ആക്കുക|കഴിഞ്ഞു|തീർന്നു|ചെയ്യു|ചേർക്കു|ചേർക്കുക|കളയു|ഒഴിവാക്കു)/;

/** "nale kazhinju" is the day after tomorrow, not something finished. */
const DAY_AFTER = /\b(nale|naale|nalekazhinju)\s+kazhinj/;

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
  if (
    /^(please\s+|ok\s+|okay\s+|now\s+|just\s+)*(mark|tick|complete|finish|close|reopen|unmark|undo|restore|put\s+back|push|move|postpone|reschedule|snooze|delay|shift|defer|delete|remove|clear|erase|drop|set|change|update|add|note|record|save)\b/.test(
      t
    )
  ) {
    return true;
  }

  // Manglish: a command word carries the instruction, unless the sentence is
  // asking something — "innale entha chelavaayathu" must still be a question.
  if (MANGLISH_QUESTIONS.test(t)) return false;
  if (SCRIPT_COMMANDS.test(text)) return true;
  if (DAY_AFTER.test(t)) return false;
  return MANGLISH_COMMANDS.test(t);
}
