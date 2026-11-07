import { sameName } from './names';

/**
 * M23: PSRA licence numbers, as printed on a licence or the public register ("001234"). The
 * register is updated weekly; a number with the right name on it passes, anything else goes
 * to a person at Gaff.
 */

/** Digits only, or null if it can't be a licence number. */
export function normaliseLicence(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '');
  return /^\d{3,12}$/.test(digits) ? digits : null;
}

/** Leading zeros aren't always typed: "1234" and "001234" are the same licence. */
export function sameLicence(a: string, b: string): boolean {
  const strip = (n: string) => n.replace(/^0+/, '');
  return strip(a) === strip(b);
}

export interface RegisterEntry {
  licenceNumber: string;
  name: string;
  status: 'current' | 'expired' | 'revoked';
}

export type RegisterMatch =
  | { outcome: 'match'; entry: RegisterEntry }
  | { outcome: 'needs_review'; reason: 'name_differs' | 'not_current' | 'not_found' };

/** Looks a claimed licence up in the register: the number and the name must both agree. */
export function matchRegister(
  claim: { licenceNumber: string; names: readonly string[] },
  register: readonly RegisterEntry[],
): RegisterMatch {
  const entry = register.find((e) => sameLicence(e.licenceNumber, claim.licenceNumber));
  if (!entry) return { outcome: 'needs_review', reason: 'not_found' };
  if (entry.status !== 'current') return { outcome: 'needs_review', reason: 'not_current' };
  if (!claim.names.some((name) => sameName(name, entry.name))) {
    return { outcome: 'needs_review', reason: 'name_differs' };
  }
  return { outcome: 'match', entry };
}
