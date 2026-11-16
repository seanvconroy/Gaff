import { describe, expect, it } from 'vitest';
import { contextFor, homeFor } from './context';

describe('UX-NV-19: which side of Gaff a signed-in person is on', () => {
  it('a member of an organisation is letting', () => {
    expect(contextFor({ memberOfAnOrganisation: true })).toBe('letting');
  });

  it('anyone else is renting', () => {
    expect(contextFor({ memberOfAnOrganisation: false })).toBe('renting');
  });

  it('letting opens on Today, and renting on Search, the public site’s first screen', () => {
    expect(homeFor('letting')).toBe('/today');
    expect(homeFor('renting')).toBe('/');
  });
});
