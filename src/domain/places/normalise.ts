/**
 * M56: one way of writing place names, used for the place index and for what renters type, so
 * "Dún Laoghaire", "dun laoghaire" and "Dun-Laoghaire" all match, and "Highfield Rd" finds
 * "Highfield Road". Fadas are dropped (in code, not with Postgres's unaccent, which can't be
 * indexed).
 */

/** Lower case, no fadas or apostrophes, "&" as "and", and single spaces between words. */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Short forms renters type, and the words the index holds. "St" can mean street or saint. */
const abbreviations: Record<string, string[]> = {
  rd: ['road'],
  st: ['street', 'saint'],
  ave: ['avenue'],
  av: ['avenue'],
  pk: ['park'],
  sq: ['square'],
  tce: ['terrace'],
  ter: ['terrace'],
  cres: ['crescent'],
  cl: ['close'],
  ct: ['court'],
  dr: ['drive'],
  gro: ['grove'],
  gdns: ['gardens'],
  hts: ['heights'],
  pl: ['place'],
  lr: ['lower'],
  lwr: ['lower'],
  upr: ['upper'],
  up: ['upper'],
  nth: ['north'],
  sth: ['south'],
  mt: ['mount'],
  hosp: ['hospital'],
  stn: ['station'],
  uni: ['university'],
};

/**
 * What a renter typed, normalised, with "County" and "Co." taken off the front ("County Sligo"
 * means Sligo). Empty when nothing searchable is left.
 */
export function normaliseQuery(typed: string): string {
  return normalise(typed).replace(/^(county|co) (?=\S)/, '');
}

/**
 * Q60: a surname's prefix written apart or together. "O Connell", "O'Connell" and "OConnell"
 * are one name, and so are "Mc Curtain" and "McCurtain", "Mac Curtain" and "MacCurtain": the
 * prefix joins the word after it, unless that word is a prefix too. Takes and gives normalised
 * text.
 *
 * It is not part of `normalise`, on purpose: the index's `search_text` and a home's address
 * words (`gaff_address_words`, the SQL twin of `addressWordsOf`) are written with `normalise`,
 * and stay as they are. The place search joins what was typed and the names it compares it
 * with, each time it compares them.
 */
export function joinSurnames(text: string): string {
  return text.replace(/(^| )(o|mc|mac) (?=[a-z])(?!(?:o|mc|mac) )/g, '$1$2');
}

/** A place's name in the form the place search compares names in: "O Neill Bridge" is "oneill bridge". */
export function matchForm(name: string): string {
  return joinSurnames(normalise(name));
}

/**
 * What a renter typed in the place search, in that same form: "O Connell St" and "o'connell st"
 * are both "oconnell st".
 */
export function placeQuery(typed: string): string {
  return joinSurnames(normaliseQuery(typed));
}

/**
 * A joined surname the other way it may be held: "oconnell" as "o connell". Nearly every name
 * in the index is held joined ("O'Connell" is "oconnell"), but a few are written apart
 * ("Mc Curtain Street"), and the index is asked for both. Null for any other word.
 */
export function writtenApart(word: string): string | null {
  const parts = /^(mac|mc|o)([a-z]{3,})$/.exec(word);
  return parts ? `${parts[1]} ${parts[2]}` : null;
}

/**
 * The words of a query, each with the forms it may stand for. The last word is still being
 * typed, so it only has to start a word in the place's name.
 */
export function queryWords(query: string): string[][] {
  return wordForms(normaliseQuery(query));
}

/** The same for the place search, with surnames joined: "o connell st" is "oconnell", then "st". */
export function placeQueryWords(typed: string): string[][] {
  return wordForms(placeQuery(typed));
}

function wordForms(normalised: string): string[][] {
  return normalised
    .split(' ')
    .filter(Boolean)
    .map((word) => [word, ...(abbreviations[word] ?? [])]);
}

/**
 * Does a query match these words of a place? A finished word must be one of them (or a form it
 * stands for), so "main" doesn't match "mainistreach"; the last, still being typed, only has to
 * start one.
 */
export function wordsMatch(query: string[][], words: readonly string[]): boolean {
  return query.every((forms, i) => {
    const last = i === query.length - 1;
    return forms.some((form) =>
      words.some((word) => (last ? word.startsWith(form) : word === form)),
    );
  });
}

/** Trigrams as Postgres's pg_trgm makes them: each word padded with two spaces before, one after. */
export function trigrams(text: string): Set<string> {
  const grams = new Set<string>();
  for (const word of normalise(text).split(' ').filter(Boolean)) {
    const padded = `  ${word} `;
    for (let i = 0; i < padded.length - 2; i++) grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

/** Shared trigrams over all trigrams, from 0 to 1: how alike two spellings are ("Kinsael", "Kinsale"). */
export function similarity(a: string, b: string): number {
  const ga = trigrams(a);
  const gb = trigrams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let shared = 0;
  for (const g of ga) if (gb.has(g)) shared++;
  return shared / (ga.size + gb.size - shared);
}
