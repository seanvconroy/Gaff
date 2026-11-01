import { z } from 'zod';

/**
 * R23, stage 8: the payment request. The deposit and the first month's rent are the only
 * payments, each capped at one month's rent (rule 4), paid straight into the operator's own
 * account: Gaff never holds money (rule 5). IBANs are checked, so a typo can't send a renter's
 * money astray.
 */
export function normaliseIban(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase();
}

export function isValidIban(input: string): boolean {
  const iban = normaliseIban(input);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.startsWith('IE') && iban.length !== 22) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const value = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function formatIban(iban: string): string {
  return normaliseIban(iban)
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

export const paymentAccountSchema = z.object({
  accountName: z.string().trim().min(1, 'Enter the name on the account.').max(80),
  iban: z
    .string()
    .refine(isValidIban, 'That IBAN doesn’t look right. Check it against your bank’s details.')
    .transform(normaliseIban),
});

export function paymentAmounts(input: { rentCents: number; depositCents: number }) {
  if (input.depositCents > input.rentCents) {
    throw new Error('A deposit can’t be more than one month’s rent (rule 4).');
  }
  return {
    depositCents: input.depositCents,
    firstRentCents: input.rentCents,
    totalCents: input.depositCents + input.rentCents,
  };
}
