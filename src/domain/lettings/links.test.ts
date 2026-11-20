import { describe, expect, it } from 'vitest';
import { seeItOnGaffHref } from './links';

describe('UX-LP-5: "See it on Gaff" is only for a home that has a public page now', () => {
  it('UX-LP-5: never for a home with no page: being set up, let, switched off, or missing what the page needs', () => {
    expect(seeItOnGaffHref({ publicRef: '0123456789ab', shownOnGaff: false })).toBeNull();
  });

  it('UX-LP-5, UX-LS-1: a home shown on Gaff links to its page, by its public reference', () => {
    expect(seeItOnGaffHref({ publicRef: '0123456789ab', shownOnGaff: true })).toBe(
      '/homes/0123456789ab',
    );
  });
});
