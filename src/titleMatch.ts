/**
 * Guard for web-searched spellings: is the suggestion the same title, spelled
 * properly, or a different thing altogether? Pure, so it is tested in plain
 * Node — the search itself lives in src/ai/spelling.ts.
 */

/** Lowercase, strip accents and anything that is not a letter or digit. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function distance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = previous[j];
      previous[j] = next;
    }
  }
  return previous[b.length];
}

/** How alike two titles are once spelling noise is removed, 0..1. */
export function similarity(a: string, b: string): number {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const longest = Math.max(left.length, right.length);
  return (longest - distance(left, right)) / longest;
}

/** Below this, the suggestion is treated as a different title and ignored. */
export const MIN_SIMILARITY = 0.6;
const MAX_EXTRA_WORDS = 3;
/** Extra characters tacked onto the end that make it a different release. */
const SEQUEL_SUFFIX = 3;

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);

/**
 * Should a searched spelling replace what was heard?
 *
 * Yes when it is recognisably the same title — accents, punctuation and a few
 * misheard letters are exactly what this is for ("ghost of yachty" ->
 * "Ghost of Yōtei"). No when the search wandered off to another title, padded
 * the answer with a sentence, or came back empty: a wrong title saved
 * confidently is worse than a misspelled one the person can fix.
 */
export function acceptCorrection(heard: string, suggested: string): boolean {
  const candidate = suggested.trim().replace(/^["']|["']$/g, '');
  if (!candidate || candidate.length > 90) return false;
  if (/[\n\r]/.test(candidate)) return false;
  if (words(candidate).length > words(heard).length + MAX_EXTRA_WORDS) return false;
  if (candidate === heard) return false;

  const wanted = normalize(heard);
  const offered = normalize(candidate);
  // Same letters, different accents, punctuation or case: exactly the fix this
  // exists for ("Pokemon Legends Z-A" -> "Pokémon Legends: Z-A").
  if (offered === wanted) return true;
  // The heard title plus a tail is a sequel or edition, not a spelling:
  // "Hollow Knight" must never be saved as "Hollow Knight: Silksong".
  if (offered.startsWith(wanted) && offered.length - wanted.length >= SEQUEL_SUFFIX) return false;
  if (similarity(wanted, offered) >= MIN_SIMILARITY) return true;

  // Official titles often carry a publisher or studio in front — "Marvel's
  // Spider-Man: Miles Morales" for what you said as "spider man my smallers".
  // The extra words drag the comparison below the bar, so try again from each
  // later word; the sequel rule still applies to whatever is left.
  const laterWords = words(candidate);
  for (let start = 1; start < laterWords.length; start += 1) {
    const window = normalize(laterWords.slice(start).join(' '));
    if (!window) continue;
    if (window.startsWith(wanted) && window.length - wanted.length >= SEQUEL_SUFFIX) continue;
    if (window === wanted || similarity(wanted, window) >= MIN_SIMILARITY) return true;
  }

  return false;
}
