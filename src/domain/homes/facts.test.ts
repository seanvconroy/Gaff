import { describe, expect, it } from 'vitest';
import { depositProblem, moveInCostCents, propertyTypes } from './facts';

describe('M39: the facts of a home', () => {
  it('rule 4: a deposit of up to one month’s rent is fine', () => {
    expect(depositProblem(250_000, 250_000)).toBeNull();
    expect(depositProblem(0, 250_000)).toBeNull();
  });

  it('rule 4: a deposit above one month’s rent is refused', () => {
    expect(depositProblem(250_001, 250_000)).toMatch(/more than one month’s rent/);
    expect(depositProblem(-1, 250_000)).toMatch(/Enter the deposit/);
  });

  it('M67: the cost to move in is the first month and the deposit, nothing else', () => {
    expect(moveInCostCents(250_000, 250_000)).toBe(500_000);
  });

  it('keeps the property types the workflow already uses', () => {
    expect(Object.keys(propertyTypes)).toEqual(
      expect.arrayContaining(['apartment', 'house', 'duplex', 'studio', 'other']),
    );
  });
});
