/**
 * Understanding Malayalam mixed into English, on the phone.
 *
 * People speak and type a blend — "innale 500 roopa petrol adichu", "kazhinja
 * maasam entha chelavaayathu?" — in Latin letters (Manglish) or in Malayalam
 * script. Retrieval here is English keyword matching, so a question in
 * Manglish would score nothing and fall back to the model for no good reason.
 *
 * This turns the common words into their English equivalents before anything
 * else sees them, which gets keyword search, the category hints and the
 * date-range detector working with no extra call. Pure, so the glossary and
 * the decisions are unit tested in plain Node.
 *
 * Nothing here translates a whole sentence; it only swaps words it knows.
 * Anything unrecognised is left exactly as it was, to be handled by the model
 * (see needsTranslation).
 */

/** Malayalam's Unicode block. Script means a question no glossary will cover. */
const SCRIPT = /[ഀ-ൿ]/;

export function hasMalayalamScript(text: string): boolean {
  return SCRIPT.test(text);
}

/**
 * Phrases first, because several only mean what they mean together:
 * "kazhinja aazhcha" is last week, while "kazhinja" alone is just "past".
 * Longest first, so a phrase is never half-eaten by a shorter one.
 */
const PHRASES: [RegExp, string][] = [
  [/\bnale\s*(kazhinju|kazhinj|ellam)\b/g, 'day after tomorrow'],
  [/\badutha\s*(aazhcha|azhcha)\b/g, 'next week'],
  [/\bkazhinja\s*(aazhcha|azhcha)\b/g, 'last week'],
  [/\badutha\s*maasam\b/g, 'next month'],
  [/\bkazhinja\s*maasam\b/g, 'last month'],
  [/\bee\s*maasam\b/g, 'this month'],
  [/\bee\s*(aazhcha|azhcha)\b/g, 'this week'],
  [/\bkazhinja\s*(varsham|varsha)\b/g, 'last year'],
  [/\bee\s*(varsham|varsha)\b/g, 'this year'],
  [/\bethra\s*(roopa|rupa|rupees)\b/g, 'how much'],
  [/\bentha\s*chelav(a+yathu|u|)\b/g, 'how much did i spend'],
  [/\bchelav(a+yathu|aayi)\b/g, 'spent'],
  [/\bvaangiy(athu|a)\b/g, 'bought'],
  [/\bpoy(athu|i)\b/g, 'went'],
];

/**
 * One word at a time. Keys are lowercase and already stripped of punctuation.
 *
 * Deliberately small: the words that carry meaning for search — when
 * something happened, what kind of thing it was, what was done — rather than
 * an attempt at a dictionary.
 */
const WORDS: Record<string, string> = {
  // When
  innu: 'today',
  indu: 'today',
  innale: 'yesterday',
  innalathe: 'yesterday',
  nale: 'tomorrow',
  nalathe: 'tomorrow',
  raavile: 'morning',
  ravile: 'morning',
  ucha: 'noon',
  uchakku: 'noon',
  vykunneram: 'evening',
  vaikunneram: 'evening',
  vaikittu: 'evening',
  raathri: 'night',
  rathri: 'night',
  divasam: 'day',
  aazhcha: 'week',
  azhcha: 'week',
  maasam: 'month',
  varsham: 'year',
  ippo: 'now',
  ippozhe: 'now',
  // Days
  njayar: 'sunday',
  tinkal: 'monday',
  thinkal: 'monday',
  chovva: 'tuesday',
  budhan: 'wednesday',
  vyazham: 'thursday',
  velli: 'friday',
  shani: 'saturday',
  // Asking
  eppozha: 'when',
  eppol: 'when',
  eppo: 'when',
  ethra: 'how much',
  entha: 'what',
  enthu: 'what',
  enth: 'what',
  evide: 'where',
  evideya: 'where',
  aara: 'who',
  aaranu: 'who',
  engane: 'how',
  ethu: 'which',
  undo: 'is there',
  // Doing
  poyi: 'went',
  vaangi: 'bought',
  vangi: 'bought',
  kodutthu: 'gave',
  koduthu: 'gave',
  adichu: 'paid',
  undu: 'there is',
  kazhichu: 'ate',
  kazhikkanam: 'eat',
  ormippikkuka: 'remind',
  ormippikkanam: 'remind',
  orma: 'remind',
  cheyyanam: 'do',
  cheythu: 'did',
  // Things
  chelavu: 'expense',
  panam: 'money',
  roopa: 'rupees',
  rupa: 'rupees',
  rs: 'rupees',
  bakshanam: 'food',
  chaaya: 'tea',
  marunnu: 'medicine',
  aashupathri: 'hospital',
  yaathra: 'travel',
  veedu: 'home',
  joli: 'work',
  kada: 'shop',
  vandi: 'vehicle',
  ente: 'my',
  njaan: 'i',
  njan: 'i',
  oppam: 'with',
};

/** A few script words common enough to be worth catching without a call. */
const SCRIPT_WORDS: Record<string, string> = {
  ഇന്ന്: 'today',
  ഇന്നലെ: 'yesterday',
  നാളെ: 'tomorrow',
  രാവിലെ: 'morning',
  വൈകുന്നേരം: 'evening',
  രാത്രി: 'night',
  ആഴ്ച: 'week',
  മാസം: 'month',
  ചെലവ്: 'expense',
  പണം: 'money',
  രൂപ: 'rupees',
  എത്ര: 'how much',
  എപ്പോൾ: 'when',
  എവിടെ: 'where',
  ആര്: 'who',
  എന്ത്: 'what',
  വാങ്ങി: 'bought',
  പോയി: 'went',
};

/** Malayalam number words, for money and counts. */
const NUMBERS: Record<string, number> = {
  onnu: 1,
  randu: 2,
  rendu: 2,
  moonu: 3,
  moonnu: 3,
  naalu: 4,
  nalu: 4,
  anchu: 5,
  anju: 5,
  aaru: 6,
  aru: 6,
  ezhu: 7,
  ettu: 8,
  onpathu: 9,
  pathu: 10,
};

/** Multipliers, and the amounts that are a word of their own. */
const SCALES: Record<string, number> = {
  ayiram: 1000,
  ayira: 1000,
  nooru: 100,
  pathinayiram: 10000,
  laksham: 100000,
};

const FIXED_AMOUNTS: Record<string, number> = {
  irunooru: 200,
  munnooru: 300,
  nalunooru: 400,
  anjuru: 500,
  anchuru: 500,
  aarunooru: 600,
  onnara: 1.5,
};

/**
 * Turn spoken amounts into figures: "randu ayiram" -> 2000, "anjuru roopa"
 * -> "500 rupees", "1.5k" -> 1500, "onnara ayiram" -> 1500.
 *
 * Only money words are touched. A number already written as digits is left
 * alone, so "500 roopa" keeps its 500 and only loses the Malayalam word.
 */
export function normalizeMoney(text: string): string {
  let out = text.replace(/\b(\d+(?:\.\d+)?)\s*k\b/gi, (_, n) => String(Math.round(Number(n) * 1000)));

  const tokens = out.split(/(\s+)/);
  const result: string[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const raw = tokens[i];
    const word = raw.toLowerCase().replace(/[^a-z0-9.]/g, '');
    if (!word) {
      result.push(raw);
      continue;
    }

    // A count or a half, followed by a scale: "randu ayiram", "onnara ayiram".
    const count = NUMBERS[word] ?? FIXED_AMOUNTS[word] ?? (/^\d+(\.\d+)?$/.test(word) ? Number(word) : null);
    const nextWord = (tokens[i + 2] ?? '').toLowerCase().replace(/[^a-z]/g, '');
    if (count !== null && SCALES[nextWord] !== undefined) {
      result.push(String(Math.round(count * SCALES[nextWord])));
      i += 2; // the separator and the scale word
      continue;
    }

    if (FIXED_AMOUNTS[word] !== undefined && FIXED_AMOUNTS[word] >= 10) {
      result.push(String(FIXED_AMOUNTS[word]));
      continue;
    }
    if (SCALES[word] !== undefined) {
      result.push(String(SCALES[word]));
      continue;
    }
    result.push(raw);
  }

  return result.join('');
}

export interface NormalizedQuery {
  /** The question with the words it recognised swapped for English. */
  text: string;
  /** How many Manglish or Malayalam words were understood. */
  hits: number;
  hadScript: boolean;
  /** Words it did not recognise and that do not look like ordinary English. */
  unknown: string[];
}

/**
 * Words that mean a question is already English enough to search with. Not a
 * dictionary — just enough that a plain English question never counts as
 * "unknown" and triggers a translation call.
 */
const ENGLISH = new Set([
  'a', 'about', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at', 'back', 'be', 'been',
  'bought', 'buy', 'by', 'can', 'cost', 'day', 'days', 'did', 'do', 'does', 'done', 'eat',
  'evening', 'expense', 'expenses', 'far', 'first', 'food', 'for', 'from', 'get', 'go',
  'going', 'got', 'had', 'has', 'have', 'home', 'hospital', 'how', 'i', 'in', 'is', 'it',
  'its', 'last', 'left', 'list', 'many', 'me', 'medicine', 'money', 'month', 'months',
  'morning', 'most', 'much', 'my', 'need', 'next', 'night', 'noon', 'now', 'of', 'on',
  'or', 'paid', 'pay', 'pending', 'rupees', 'said', 'shop', 'show', 'since', 'so',
  'spend', 'spending', 'spent', 'tea', 'tell', 'that', 'the', 'their', 'them', 'then',
  'there', 'these', 'they', 'this', 'time', 'to', 'today', 'tomorrow', 'total', 'travel',
  'up', 'was', 'week', 'weeks', 'went', 'were', 'what', 'when', 'where', 'which', 'who',
  'why', 'will', 'with', 'work', 'would', 'year', 'years', 'yesterday', 'you', 'your',
]);

/**
 * Rewrite a question into something the English keyword search understands.
 *
 * Everything it does not know is left untouched, and reported in `unknown`,
 * so the caller can tell the difference between "this was Manglish and is now
 * English" and "this needs a model to read it".
 */
export function normalizeQuery(question: string): NormalizedQuery {
  const hadScript = hasMalayalamScript(question);
  let text = question.toLowerCase();
  let hits = 0;

  for (const [word, english] of Object.entries(SCRIPT_WORDS)) {
    if (text.includes(word)) {
      text = text.split(word).join(` ${english} `);
      hits += 1;
    }
  }

  for (const [pattern, english] of PHRASES) {
    const before = text;
    text = text.replace(pattern, english);
    if (text !== before) hits += 1;
  }

  text = normalizeMoney(text);

  const unknown: string[] = [];
  const rebuilt = text
    .split(/\s+/)
    .map((token) => {
      const word = token.replace(/[^a-z0-9]/g, '');
      if (!word) return token;
      if (WORDS[word] !== undefined) {
        hits += 1;
        return WORDS[word];
      }
      if (/^\d+(\.\d+)?$/.test(word) || ENGLISH.has(word)) return token;
      // Not understood, and not obviously English: a name, a place, or a word
      // the glossary has never met.
      unknown.push(word);
      return token;
    })
    .join(' ');

  return { text: rebuilt.replace(/\s+/g, ' ').trim(), hits, hadScript, unknown };
}

/**
 * Is this question worth spending a translation call on?
 *
 * Only when the phone could make nothing of it: no entry matched, and the
 * words were either in script or unrecognised. A question that already found
 * something, or that is plain English, never costs an extra call — which is
 * the whole point of doing the glossary work first.
 *
 * @param matches how many entries on-device retrieval scored
 */
export function needsTranslation(normalized: NormalizedQuery, matches: number): boolean {
  if (matches > 0) return false;
  if (normalized.hadScript) return true;
  // A single stray word is usually a name, which translating will not fix.
  return normalized.unknown.length >= 2;
}
