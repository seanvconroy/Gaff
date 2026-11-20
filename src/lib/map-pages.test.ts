import { describe, expect, it } from 'vitest';
import { crossesMapBoundary, isMapPage, mapPageSources } from './map-pages';

/** Next.js's path patterns, as far as these rules use them: `:name` and a trailing `:name*`. */
function matches(source: string, pathname: string): boolean {
  const pattern = source.replace(/\/:[A-Za-z]+\*$/, '(?:/.*)?').replace(/:[A-Za-z]+/g, '[^/]+');
  return new RegExp(`^${pattern === '/' ? '' : pattern}/?$`, 'i').test(pathname);
}

const letting = '0b0e0f2a-5f0e-4d0a-9d55-0f5a0e3f5a11';

describe('M119: the pages that show Google’s map', () => {
  const mapPages = [
    '/',
    // M62 (BA-12): a place's page is search, answered for that place.
    '/to-rent',
    '/to-rent/cork',
    '/to-rent/dublin/ranelagh',
    `/lettings/${letting}/setup/pin`,
    // Next.js matches header rules without regard to case, so this gets the policy too.
    `/Lettings/${letting}/setup/pin`,
  ];
  const otherPages = [
    '/homes/3f9a1c2b7d4e',
    '/saved',
    '/enquiries',
    '/sign-in',
    '/today',
    '/lettings',
    '/lettings/new',
    `/lettings/${letting}`,
    `/lettings/${letting}/setup/address`,
    `/lettings/${letting}/setup/pins`,
    `/lettings/${letting}/setup/pin/more`,
    '/r/some-private-token',
    '/to-rentals',
    '/how-results-are-ordered',
    '/internal',
  ];

  it('are Search, places’ pages and "Where is it on the map?", and nothing else', () => {
    for (const page of mapPages) expect(isMapPage(page), page).toBe(true);
    for (const page of otherPages) expect(isMapPage(page), page).toBe(false);
  });

  it('are the pages the header rules give Google’s policy to', () => {
    for (const page of [...mapPages, ...otherPages]) {
      const ruled = mapPageSources.some((source) => matches(source, page));
      expect(ruled, page).toBe(isMapPage(page));
    }
  });

  it('are left, and reached, with a new document', () => {
    const search = '/';
    const home = '/homes/3f9a1c2b7d4e';
    const pin = `/lettings/${letting}/setup/pin`;
    const address = `/lettings/${letting}/setup/address`;
    // In: Google's script would be refused under the other page's policy.
    expect(crossesMapBoundary(home, search)).toBe(true);
    expect(crossesMapBoundary(address, pin)).toBe(true);
    // Out: Google's script would stay loaded where people enter personal details.
    expect(crossesMapBoundary(search, home)).toBe(true);
    expect(crossesMapBoundary(pin, `/lettings/${letting}/setup/rent`)).toBe(true);
    // Within either side, pages swap in place as before.
    expect(crossesMapBoundary(search, pin)).toBe(false);
    expect(crossesMapBoundary(search, '/to-rent/dublin/ranelagh')).toBe(false);
    expect(crossesMapBoundary('/to-rent/dublin/ranelagh', home)).toBe(true);
    expect(crossesMapBoundary(home, '/saved')).toBe(false);
    expect(crossesMapBoundary(address, '/lettings')).toBe(false);
  });
});
