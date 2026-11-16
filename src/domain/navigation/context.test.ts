import { describe, expect, it } from 'vitest';
import { contextFor, findAHomeHref, firstScreenRedirect, homeFor, listAHomeHref } from './context';

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

describe('the public site’s first screen, which is also where sign-in lands', () => {
  it('UX-HM-1: someone letting is sent on to Today', () => {
    expect(firstScreenRedirect('letting', {})).toBe('/today');
  });

  it('UX-NV-20: a signed-out visitor, and someone renting, stay on the public site', () => {
    expect(firstScreenRedirect(null, {})).toBeNull();
    expect(firstScreenRedirect('renting', {})).toBeNull();
  });

  it('UX-NV-8: "Find a home to rent" shows the public site to someone letting', () => {
    expect(findAHomeHref).toBe('/?rent=1');
    expect(firstScreenRedirect('letting', { rent: '1' })).toBeNull();
    expect(firstScreenRedirect('letting', { rent: ['1', '1'] })).toBe('/today');
    expect(firstScreenRedirect('letting', { rent: 'no' })).toBe('/today');
  });

  it('UX-NV-8: "List a home" leads to adding a letting', () => {
    expect(listAHomeHref).toBe('/lettings/new');
  });
});
