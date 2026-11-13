/**
 * P22: does the name Stripe read from someone's ID match the name they use on Gaff, or the name
 * on their documents? Names differ for ordinary reasons (a fada, a married name, a middle name,
 * Ó or O', Mc or Mac), so a difference is shown to the person deciding, never treated as a
 * failure.
 */

/** Lower case, no accents or punctuation, Ó/O', Mc/Mac and Mac/M' made the same. */
export function normaliseName(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(o|ó)['’\s]+(?=[a-z])/g, 'o')
    .replace(/\bmac\s*(?=[a-z])/g, 'mc')
    .replace(/\bm['’](?=[a-z])/g, 'mc')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);
}

export type NameMatch = 'matches' | 'differs';

/**
 * Matches when the verified first and last names both appear in the other name, in any order,
 * so middle names and a second surname on either side don't count against anyone.
 */
export function nameMatch(verified: { first: string; last: string }, used: string): NameMatch {
  const theirs = new Set(normaliseName(used));
  const first = normaliseName(verified.first);
  const last = normaliseName(verified.last);
  if (first.length === 0 || last.length === 0) return 'differs';
  const firstFound = first.some((part) => theirs.has(part));
  const lastFound = last.some((part) => theirs.has(part));
  return firstFound && lastFound ? 'matches' : 'differs';
}

/** "Niamh Kelly": the verified name as one line, for the letter. */
export function fullName(verified: { first: string; last: string }): string {
  return `${verified.first} ${verified.last}`.replace(/\s+/g, ' ').trim();
}
