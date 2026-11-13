/**
 * Comparing names written by different people: a licence on the PSRA register (M23), a verified
 * ID (M24), the account the deposit is paid into (M30). Gaff matches only when it's sure;
 * anything else goes to a person.
 */

const COMPANY_WORDS = new Set([
  'limited',
  'ltd',
  'dac',
  'uc',
  'plc',
  'unlimited',
  'company',
  'designated',
  'activity',
  'the',
  'and',
]);

/** "Halcyon Property Solutions Ltd." → "halcyon property solutions". */
export function normaliseName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word && !COMPANY_WORDS.has(word))
    .join(' ');
}

/** The same name, ignoring case, accents, punctuation, word order and "Limited". */
export function sameName(a: string, b: string): boolean {
  const words = (name: string) => normaliseName(name).split(' ').filter(Boolean).sort().join(' ');
  const left = words(a);
  return left.length > 0 && left === words(b);
}

/**
 * M30: an account is in a person's name if it's their name, or their first and last names in
 * either order, perhaps with middle names ("Mary B. Walsh" for "Mary Walsh").
 */
export function accountInName(accountName: string, verifiedNames: readonly string[]): boolean {
  const account = new Set(normaliseName(accountName).split(' ').filter(Boolean));
  return verifiedNames.some((name) => {
    if (sameName(accountName, name)) return true;
    const words = normaliseName(name).split(' ').filter(Boolean);
    if (words.length < 2) return false;
    const [first, last] = [words[0]!, words[words.length - 1]!];
    return account.has(first) && account.has(last);
  });
}
