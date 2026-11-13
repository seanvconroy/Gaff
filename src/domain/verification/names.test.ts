import { describe, expect, it } from 'vitest';
import { accountInName, normaliseName, sameName } from './names';

describe('M23, M30: matching names', () => {
  it('ignores case, accents, punctuation and company words', () => {
    expect(normaliseName('Halcyon Property Solutions Ltd.')).toBe('halcyon property solutions');
    expect(sameName('Ó Súilleabháin Lettings Limited', 'o suilleabhain lettings')).toBe(true);
    expect(sameName('Walsh & Sons', 'Walsh and Sons Ltd')).toBe(true);
    expect(sameName('Byrne, Mary', 'Mary Byrne')).toBe(true);
  });

  it('doesn’t match different names, or nothing', () => {
    expect(sameName('Halcyon Lettings', 'Halcyon Property')).toBe(false);
    expect(sameName('Ltd', 'Limited')).toBe(false);
  });

  it('M30: the account must be in the checked letter’s name', () => {
    expect(accountInName('Mary B Walsh', ['Mary Walsh'])).toBe(true);
    expect(accountInName('WALSH MARY', ['Mary Walsh'])).toBe(true);
    expect(
      accountInName('Halcyon Property Solutions Limited', ['Halcyon Property Solutions']),
    ).toBe(true);
    expect(accountInName('John Smith', ['Mary Walsh'])).toBe(false);
    expect(accountInName('Mary Smith', ['Mary Walsh'])).toBe(false);
  });
});
