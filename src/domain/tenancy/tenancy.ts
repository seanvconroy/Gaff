import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * R22, stage 8: the tenancy agreement, signed by both sides. Signing is the third of the three
 * decisions people make (Principle 1): the operator's signature is a person's decision. Whether
 * a residential tenancy may be signed electronically in Ireland is for the solicitor (Electronic
 * Commerce Act 2000, s.10(1)(b)), so Gaff also supports signing on paper (Q23).
 */
export function normaliseName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\s'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function signatureMatches(typed: string, expected: string): boolean {
  return normaliseName(typed) !== '' && normaliseName(typed) === normaliseName(expected);
}

export const signatureSchema = z
  .object({
    typedName: z.string().trim().min(1, 'Type your full name to sign.').max(120),
    consent: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.consent !== 'yes') {
      ctx.addIssue({
        code: 'custom',
        path: ['consent'],
        message: 'Tick the box to sign electronically.',
      });
    }
  })
  .transform(({ typedName }) => ({ typedName }));

/** A fingerprint of the exact text sent for signing. */
export function agreementHash(document: unknown): string {
  return createHash('sha256').update(JSON.stringify(document)).digest('hex');
}

/** Rent falls due on the start date's day of the month, or the 28th if that's later. */
export function rentDueDay(startDate: string): number {
  return Math.min(Number(startDate.slice(8, 10)), 28);
}

/** R24: register with the RTB within one month of the tenancy starting (RTB guidance). */
export function rtbDeadline(startDate: string): string {
  const [y, m, d] = startDate.split('-').map(Number) as [number, number, number];
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, lastDay))).toISOString().slice(0, 10);
}
