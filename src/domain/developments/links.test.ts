import { describe, expect, it } from 'vitest';
import {
  developmentStepAfter,
  progressAt,
  progressSegments,
  typeResumeStep,
  typeStepAfter,
} from './links';

describe('BA-15: adding a development, a screen at a time', () => {
  it('goes address, pin, facts, photos, then its first type', () => {
    expect(developmentStepAfter('address')).toBe('pin');
    expect(developmentStepAfter('photos')).toBe('types');
    expect(typeStepAfter('home')).toBe('rent');
    expect(typeStepAfter('homes')).toBe('details');
    expect(typeStepAfter('review')).toBe('review');
    expect(progressAt('review')).toBe(progressSegments.length - 1);
  });

  it('comes back to where a type’s homes have got', () => {
    const home = { status: 'draft', criteriaSet: false, rentCheck: null };
    expect(typeResumeStep({ rentCents: null, homeCount: null, homes: [] })).toBe('rent');
    expect(typeResumeStep({ rentCents: 265_000, homeCount: 4, homes: [home] })).toBe('homes');
    expect(typeResumeStep({ rentCents: 265_000, homeCount: 1, homes: [home] })).toBe('details');
    expect(
      typeResumeStep({
        rentCents: 265_000,
        homeCount: 1,
        homes: [{ ...home, criteriaSet: true }],
      }),
    ).toBe('rent-check');
    expect(
      typeResumeStep({
        rentCents: 265_000,
        homeCount: 2,
        homes: [
          { ...home, criteriaSet: true, rentCheck: 'market' },
          { status: 'live', criteriaSet: true, rentCheck: 'market' },
        ],
      }),
    ).toBe('review');
  });
});
