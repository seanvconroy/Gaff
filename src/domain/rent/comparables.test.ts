import { describe, expect, it } from 'vitest';
import {
  comparableFieldName,
  comparableWarnings,
  comparablesFormSchema,
  medianRentCents,
} from './comparables';

const schema = comparablesFormSchema('2026-10-31');
const row = (n: number, overrides: Record<string, string> = {}) => ({
  [`c${n}Area`]: 'Dublin 6',
  [`c${n}PropertyType`]: 'apartment',
  [`c${n}Bedrooms`]: '2',
  [`c${n}Rent`]: '1,800',
  [`c${n}RegisteredOn`]: '',
  ...overrides,
});

describe('R4: three comparable rents from the RTB Rent Register', () => {
  it('reads three comparables', () => {
    const comparables = schema.parse({
      ...row(1),
      ...row(2, { c2Rent: '1,950', c2RegisteredOn: '2026-06-01' }),
      ...row(3, { c3Bedrooms: '3', c3Rent: '2100' }),
    });
    expect(comparables).toEqual([
      { area: 'Dublin 6', propertyType: 'apartment', bedrooms: 2, monthlyRentCents: 180_000 },
      {
        area: 'Dublin 6',
        propertyType: 'apartment',
        bedrooms: 2,
        monthlyRentCents: 195_000,
        registeredOn: '2026-06-01',
      },
      { area: 'Dublin 6', propertyType: 'apartment', bedrooms: 3, monthlyRentCents: 210_000 },
    ]);
    expect(medianRentCents(comparables)).toBe(195_000);
  });

  it('needs all three, and names the one with a problem', () => {
    const result = schema.safeParse({ ...row(1), ...row(2), ...row(3, { c3Rent: '' }) });
    expect(result.success).toBe(false);
    const issue = result.error!.issues[0]!;
    expect(issue.message).toBe('Comparable 3: enter the monthly rent in euro, like 1,800');
    expect(comparableFieldName(issue.path)).toBe('c3Rent');
  });

  it('refuses a register date in the future', () => {
    const result = schema.safeParse({
      ...row(1, { c1RegisteredOn: '2027-01-01' }),
      ...row(2),
      ...row(3),
    });
    expect(result.error?.issues[0]?.message).toContain('can’t be in the future');
  });

  it('warns, without blocking, when a comparable isn’t much like the home', () => {
    const comparables = schema.parse({
      ...row(1),
      ...row(2, { c2PropertyType: 'house' }),
      ...row(3, { c3Bedrooms: '4' }),
    });
    expect(comparableWarnings({ propertyType: 'apartment', bedrooms: 2 }, comparables)).toEqual([
      'Comparable 2 is a different type of home (house).',
      'Comparable 3 has 4 bedrooms; this home has 2.',
    ]);
  });
});
