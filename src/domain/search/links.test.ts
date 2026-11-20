import { describe, expect, it } from 'vitest';
import { askHref, homePageHref } from './links';

describe('UX-AV-3: what search knows travels to a home, and on to asking to view', () => {
  it('UX-SR-6: a result opens the home by its public reference', () => {
    expect(homePageHref('3f9a1c2b7d4e')).toBe('/homes/3f9a1c2b7d4e');
  });

  it('UX-AV-3: the four answers go with it, in search’s own names; nothing else of the search does', () => {
    const filters = {
      where: 'ranelagh',
      maxRent: 2000,
      beds: 2,
      people: 2,
      pets: false,
      moveIn: '2027-01-01',
      stay: 'year' as const,
      furnished: true as const,
    };
    expect(homePageHref('3f9a1c2b7d4e', filters)).toBe(
      '/homes/3f9a1c2b7d4e?from=2027-01-01&stay=year&people=2&pets=no',
    );
    expect(askHref('3f9a1c2b7d4e', { people: 3 })).toBe('/homes/3f9a1c2b7d4e/ask?people=3');
  });
});
