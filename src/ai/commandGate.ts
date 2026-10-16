/**
 * Does this read as an instruction rather than a question?
 *
 * Checked on the phone before any model call, so asking things — which is what
 * the Ask box is mostly for — costs exactly what it did before. A question is
 * never sent for interpretation; an instruction is, whether it opens with a
 * verb ("push the dentist to Friday"), states a correction ("the dinner was
 * actually 1450"), or puts its verb last, as Malayalam does ("dentist nale
 * maattu").
 *
 * Deliberately kept free of imports so it can be exercised on its own.
 */

/** A question, whatever follows. Checked before anything else. */
const QUESTION_OPENERS =
  /^(what|when|where|who|why|how|which|did|do|does|is|are|was|were|can|could|should|would|will|am|have|has|tell|show|list|compare)\b/;

/** An instruction that opens with its verb, the ordinary English shape. */
const IMPERATIVE =
  /^(please\s+|ok\s+|okay\s+|now\s+|just\s+|can\s+you\s+|could\s+you\s+)*(mark|tick|strike|complete|finish|close|reopen|unmark|undo|restore|put\s+back|push|move|postpone|reschedule|snooze|delay|shift|defer|bring\s+forward|delete|remove|clear|erase|drop|cancel|set|change|update|make|correct|fix|rename|raise|lower|bump|prioriti[sz]e|deprioriti[sz]e|add|note|record|save|group)\b/;

/**
 * A correction, which rarely opens with a verb: "the dinner was actually
 * 1450", "that bill should be high priority", "it's 1200 not 1450". The
 * correcting word has to come with something to correct to — a number, a
 * priority, a date word — or an ordinary remark would be read as an order.
 */
const CORRECTION = /\b(actually|should\s+be|should'?ve\s+been|instead\s+of|rather\s+than|not)\b/;
const CORRECTION_TARGET =
  /(\d|\b(high|medium|low)\s+priority\b|\bpriority\b|\bcategory\b|\btomorrow\b|\btoday\b|\bnext\s+(week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b)/;

/** "the bill is high priority" — a statement that only makes sense as an order. */
const PRIORITY_STATEMENT = /\b(high|medium|low)\s+priority\b/;

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

  // Checked first: "can you", "could you", "would" open both an ordinary
  // question ("can you tell me...") and a politely-phrased order ("can you
  // change the priority..."). IMPERATIVE only matches the latter — it
  // requires one of its own action verbs right after the opener — so letting
  // it win first tells the two apart instead of QUESTION_OPENERS claiming
  // every "can"/"could"/"would" sentence before IMPERATIVE is ever checked.
  if (IMPERATIVE.test(t)) return true;
  if (QUESTION_OPENERS.test(t)) return false;
  if (CORRECTION.test(t) && CORRECTION_TARGET.test(t)) return true;
  if (PRIORITY_STATEMENT.test(t)) return true;

  // Manglish: a command word carries the instruction, unless the sentence is
  // asking something — "innale entha chelavaayathu" must still be a question.
  if (MANGLISH_QUESTIONS.test(t)) return false;
  if (SCRIPT_COMMANDS.test(text)) return true;
  if (DAY_AFTER.test(t)) return false;
  return MANGLISH_COMMANDS.test(t);
}
