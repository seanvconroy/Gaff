import { describe, expect, it } from 'vitest';
import { homePageOnGaff, seeItOnGaffHref } from './links';

describe('UX-LP-5: "See it on Gaff" is only for a live home shown on Gaff', () => {
  it('UX-LP-5: never for a home being set up, closed, or not shown on Gaff', () => {
    expect(seeItOnGaffHref({ id: 'l1', status: 'draft', shownOnGaff: true })).toBeNull();
    expect(seeItOnGaffHref({ id: 'l1', status: 'let', shownOnGaff: true })).toBeNull();
    expect(seeItOnGaffHref({ id: 'l1', status: 'live', shownOnGaff: false })).toBeNull();
  });

  it('UX-LP-5: a live home on Gaff links to its public page, once that page exists (WP-20)', () => {
    expect(seeItOnGaffHref({ id: 'l1', status: 'live', shownOnGaff: true })).toBe(
      homePageOnGaff('l1'),
    );
  });
});
