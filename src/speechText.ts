/**
 * Pure clean-up of recognized speech, kept out of the voice hooks so it runs
 * and is tested in plain Node.
 */
import type { Memory } from './types';

function nameCase(letters: string): string {
  return letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase();
}

/**
 * Turn a spelled-out name back into the name: "call J O H N" -> "call John".
 * Recognizers write spoken letters as separate single letters ("J O H N",
 * "J. O. H. N.") or hyphenated ("J-O-H-N"). Three letters minimum, so the
 * ordinary words "I" and "a" never merge with their neighbours.
 *
 * People usually say the name first and then spell it ("Jon, J O H N"), so a
 * capitalised word just before, starting with the same letter, is taken as the
 * misheard attempt and replaced rather than doubled up.
 */
export function joinSpelledLetters(text: string): string {
  const tokens = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];

  const push = (word: string, trailing: string) => {
    const previous = out[out.length - 1];
    if (
      previous !== undefined &&
      /^[A-Z][a-z']*$/.test(previous) &&
      previous[0].toLowerCase() === word[0].toLowerCase()
    ) {
      out.pop();
    }
    out.push(word + trailing);
  };

  let i = 0;
  while (i < tokens.length) {
    const hyphenated = tokens[i].match(/^((?:[A-Za-z]-){2,}[A-Za-z])([,!?;:.]?)$/);
    if (hyphenated) {
      push(nameCase(hyphenated[1].replace(/-/g, '')), hyphenated[2]);
      i += 1;
      continue;
    }

    const letters: string[] = [];
    let trailing = '';
    let j = i;
    while (j < tokens.length) {
      const letter = tokens[j].match(/^([A-Za-z])\.?([,!?;:]?)$/);
      if (!letter) break;
      letters.push(letter[1]);
      j += 1;
      if (letter[2]) {
        trailing = letter[2];
        break;
      }
    }

    if (letters.length >= 3) {
      push(nameCase(letters.join('')), trailing);
      i = j;
    } else {
      out.push(tokens[i]);
      i += 1;
    }
  }

  return out.join(' ');
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[.,!?;:]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Did the recognizer throw away what it had and start over, rather than
 * revise it? Some recognizers (some Android phones, iOS after a pause) begin a
 * new live transcript mid-note without ever finalising the old one. Replacing
 * the old text with the new would silently erase the start of the note, so the
 * caller keeps the old text as a finished segment instead.
 *
 * A revision keeps roughly the same length and opening; a restart is much
 * shorter and begins differently. Short texts are never treated as a restart,
 * since early revisions of a few words legitimately change a lot.
 */
export function isFreshPartial(previous: string, next: string): boolean {
  const before = words(previous);
  const after = words(next);
  if (before.length < 4 || after.length === 0) return false;
  if (after.length * 2 > before.length) return false;
  return after[0] !== before[0];
}

/**
 * Does a final result open with text already kept from an abandoned live
 * transcript? Some recognizers restart their live captions but still send one
 * final result covering everything; keeping both would say it all twice.
 * Compares the opening words only, since the final wording is often revised.
 */
export function restatesEarlier(final: string, earlier: string): boolean {
  const opening = words(earlier).slice(0, 3);
  const finalWords = words(final);
  if (opening.length === 0 || finalWords.length < opening.length) return false;
  return opening.every((word, index) => finalWords[index] === word);
}

const MAX_KNOWN_PEOPLE = 50;

/**
 * Names already in the record, most recently mentioned first, spelled the way
 * they were saved. Handed to the speech recognizer as hints and to the
 * extraction model as known spellings.
 */
export function knownPeople(memories: Pick<Memory, 'people' | 'createdAt'>[]): string[] {
  const seen = new Map<string, string>();
  const newestFirst = [...memories].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const memory of newestFirst) {
    for (const raw of (memory.people ?? '').split(',')) {
      const name = raw.trim();
      const key = name.toLowerCase();
      if (name && !seen.has(key)) seen.set(key, name);
    }
  }
  return [...seen.values()].slice(0, MAX_KNOWN_PEOPLE);
}
