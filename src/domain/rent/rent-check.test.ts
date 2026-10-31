import { describe, expect, it } from 'vitest';
import { capCeilingCents, checkRent, rentCheckFormSchema } from './rent-check';

const previous = {
  substantialChange: false,
  previousRentCents: 170_000,
  previousRentSetOn: '2025-03-01',
};

describe('R3: can the rent be reset to market under the 2026 rules?', () => {
  it('a home never let before can be let at market rent', () => {
    expect(checkRent({ lastLet: 'never' })).toEqual({ result: 'market', reason: 'first_letting' });
  });

  it.each(['tenant_left', 'tenant_breach', 'unsuitable'] as const)(
    'market rent can be set when a tenancy under the new rules ended because %s',
    (ending) => {
      expect(checkRent({ lastLet: 'under_new_rules', ending, ...previous })).toEqual({
        result: 'market',
        reason: 'tenant_ended',
      });
    },
  );

  it('the cap applies when the landlord ended a tenancy under the new rules for another reason', () => {
    expect(
      checkRent({ lastLet: 'under_new_rules', ending: 'landlord_other', ...previous }),
    ).toEqual({ result: 'capped', reason: 'landlord_ended' });
  });

  it.each(['tenant_left', 'tenant_breach', 'unsuitable', 'landlord_other'] as const)(
    'the cap applies when the last tenancy began before 1 March 2026, however it ended (%s)',
    (ending) => {
      expect(checkRent({ lastLet: 'before_new_rules', ending, ...previous })).toEqual({
        result: 'capped',
        reason: 'tenancy_before_new_rules',
      });
    },
  );

  it('a substantial change to an older home goes to the solicitor, not a guess', () => {
    expect(
      checkRent({
        lastLet: 'before_new_rules',
        ending: 'tenant_left',
        ...previous,
        substantialChange: true,
      }),
    ).toEqual({ result: 'get_advice', reason: 'substantial_change' });
  });
});

describe('R3: the 2% ceiling', () => {
  it('allows at most 2% a year since the rent was last set', () => {
    expect(capCeilingCents(170_000, '2025-03-01', '2026-03-01')).toBe(173_400);
  });

  it('allows nothing extra when the rent was set today', () => {
    expect(capCeilingCents(170_000, '2026-10-31', '2026-10-31')).toBe(170_000);
  });

  it('compounds over several years, so the bound never understates the cap', () => {
    expect(capCeilingCents(100_000, '2024-10-31', '2026-10-31')).toBeGreaterThanOrEqual(104_040);
  });
});

describe('R3: the rent check form', () => {
  const schema = rentCheckFormSchema('2026-10-31');

  it('needs nothing more for a first letting', () => {
    expect(schema.parse({ lastLet: 'never' })).toEqual({ lastLet: 'never' });
  });

  it('reads a previous tenancy', () => {
    expect(
      schema.parse({
        lastLet: 'before_new_rules',
        ending: 'tenant_left',
        substantialChange: 'no',
        previousRent: '€1,700',
        previousRentSetOn: '2024-06-01',
      }),
    ).toEqual({
      lastLet: 'before_new_rules',
      ending: 'tenant_left',
      substantialChange: false,
      previousRentCents: 170_000,
      previousRentSetOn: '2024-06-01',
    });
  });

  it.each([
    [
      { lastLet: 'under_new_rules', previousRent: '1700', previousRentSetOn: '2026-05-01' },
      'how the last tenancy ended',
    ],
    [
      {
        lastLet: 'under_new_rules',
        ending: 'tenant_left',
        previousRent: 'lots',
        previousRentSetOn: '2026-05-01',
      },
      'last monthly rent',
    ],
    [
      {
        lastLet: 'under_new_rules',
        ending: 'tenant_left',
        previousRent: '1700',
        previousRentSetOn: '2027-01-01',
      },
      'can’t be in the future',
    ],
    [
      {
        lastLet: 'under_new_rules',
        ending: 'tenant_left',
        previousRent: '1700',
        previousRentSetOn: '2025-01-01',
      },
      'before then',
    ],
    [
      {
        lastLet: 'before_new_rules',
        ending: 'tenant_left',
        previousRent: '1700',
        previousRentSetOn: '2025-01-01',
      },
      'substantially changed',
    ],
    [{}, 'let before'],
  ])('explains a problem: %o', (input, message) => {
    const result = schema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message).join(' ')).toContain(message);
  });
});
