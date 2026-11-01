import { describe, expect, it } from 'vitest';
import { formatIban, isValidIban, paymentAccountSchema, paymentAmounts } from './payment';

describe('R23: where the deposit and first month’s rent are paid', () => {
  it('checks an IBAN properly, so a typo is caught before a renter pays into it', () => {
    expect(isValidIban('IE29 AIBK 9311 5212 3456 78')).toBe(true);
    expect(isValidIban('ie29aibk93115212345678')).toBe(true);
    expect(isValidIban('IE29 AIBK 9311 5212 3456 79')).toBe(false);
    expect(isValidIban('IE29 AIBK 9311 5212 3456')).toBe(false);
    expect(isValidIban('not an iban')).toBe(false);
  });

  it('shows an IBAN in groups of four', () => {
    expect(formatIban('ie29aibk93115212345678')).toBe('IE29 AIBK 9311 5212 3456 78');
  });

  it('needs the account holder’s name and a valid IBAN', () => {
    const result = paymentAccountSchema.safeParse({ accountName: '', iban: 'IE00 0000' });
    expect(result.error!.issues.map((i) => i.message)).toEqual([
      'Enter the name on the account.',
      'That IBAN doesn’t look right. Check it against your bank’s details.',
    ]);
    expect(
      paymentAccountSchema.parse({
        accountName: ' Halcyon Lettings Client Account ',
        iban: 'IE29 AIBK 9311 5212 3456 78',
      }),
    ).toEqual({ accountName: 'Halcyon Lettings Client Account', iban: 'IE29AIBK93115212345678' });
  });
});

describe('R23, rule 4: the only payments are the deposit and the first month’s rent', () => {
  it('adds them up, each capped at one month’s rent', () => {
    expect(paymentAmounts({ rentCents: 185_000, depositCents: 185_000 })).toEqual({
      depositCents: 185_000,
      firstRentCents: 185_000,
      totalCents: 370_000,
    });
    expect(() => paymentAmounts({ rentCents: 185_000, depositCents: 185_001 })).toThrow(
      'A deposit can’t be more than one month’s rent (rule 4).',
    );
  });
});
