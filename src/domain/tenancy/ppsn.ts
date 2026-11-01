import { z } from 'zod';

/**
 * R24 (Q24): the tenant's PPS number, asked for RTB registration only and optional (the RTB
 * recommends it but doesn't require it). Sealed, shown only in the RTB pack, and deleted once the
 * operator records the registration (CLAUDE.md rule 2). Never a date of birth (rule 3).
 */
export function normalisePpsn(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/** Seven digits and a check letter, sometimes a second letter (Revenue's published format). */
export function isValidPpsn(value: string): boolean {
  const ppsn = normalisePpsn(value);
  const match = /^(\d{7})([A-W])([A-IW]?)$/.exec(ppsn);
  if (!match) return false;
  const digits = match[1]!.split('').map(Number);
  let sum = digits.reduce((total, digit, i) => total + digit * (8 - i), 0);
  const second = match[3];
  if (second && second !== 'W') sum += (second.charCodeAt(0) - 64) * 9;
  const remainder = sum % 23;
  const check = remainder === 0 ? 'W' : String.fromCharCode(64 + remainder);
  return check === match[2];
}

export function maskPpsn(ppsn: string): string {
  const value = normalisePpsn(ppsn);
  return `${'•'.repeat(Math.max(0, value.length - 3))}${value.slice(-3)}`;
}

export const ppsnSchema = z.object({
  ppsn: z
    .string()
    .transform((v) => normalisePpsn(v))
    .refine((v) => v === '' || isValidPpsn(v), {
      message: 'That PPS number doesn’t look right. Check it, or leave it blank.',
    })
    .transform((v) => (v === '' ? null : v)),
});
