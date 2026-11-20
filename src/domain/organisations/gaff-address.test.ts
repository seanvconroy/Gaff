import { describe, expect, it } from 'vitest';
import { inboundSlugFor, ownHomesSlug } from './gaff-address';
import { letsOwnHomes, organisationKinds } from './kinds';

describe('R5: Gaff address for an organisation', () => {
  it.each([
    ['Halcyon Lettings', 'halcyon-lettings'],
    ['Ó Briain & Daughters', 'o-briain-and-daughters'],
    ['  DUBLIN 6 Homes Ltd. ', 'dublin-6-homes-ltd'],
    ['!!!', 'operator'],
    ['Postmaster', 'postmaster-lettings'],
  ])('%s → %s', (name, slug) => {
    expect(inboundSlugFor(name)).toBe(slug);
  });

  it('keeps addresses short', () => {
    expect(inboundSlugFor('A'.repeat(100)).length).toBeLessThanOrEqual(40);
  });
});

describe('UX-AC-4: a private landlord’s silent organisation', () => {
  it('rule 8: its Gaff address never holds the person’s name', () => {
    expect(ownHomesSlug('3F0E8A5C-1b2d-4c3e-9f00-aabbccddeeff')).toBe('home-3f0e8a5c');
  });

  it('refuses to make an address that isn’t random enough to be its own', () => {
    expect(() => ownHomesSlug('ab-c')).toThrow();
  });

  it('UX-AC-7: it lets its own homes, as a landlord’s team does: there is no licence', () => {
    expect(organisationKinds).toEqual(['agency', 'landlord', 'private_landlord']);
    expect(letsOwnHomes('private_landlord')).toBe(true);
    expect(letsOwnHomes('landlord')).toBe(true);
    expect(letsOwnHomes('agency')).toBe(false);
  });
});
