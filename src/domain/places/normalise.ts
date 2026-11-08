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
 * The words of a query, each with the forms it may stand for. The last word is still being
 * typed, so it only has to start a word in the place's name.
 */
export function queryWords(query: string): string[][] {
  return normaliseQuery(query)
    .split(' ')
    .filter(Boolean)
    .map((word) => [word, ...(abbreviations[word] ?? [])]);
}

/** Does a query match these words of a place? Every typed word must start one of them. */
export function wordsMatch(query: string[][], words: readonly string[]): boolean {
  return query.every((forms, i) => {
    const last = i === query.length - 1;
    return forms.some((form) =>
      words.some((word) => (last ? word.startsWith(form) : word === form || word.startsWith(form))),
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
