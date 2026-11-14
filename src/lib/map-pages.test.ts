import { describe, expect, it } from 'vitest';
import { crossesMapBoundary, isMapPage, mapPageSources } from './map-pages';

/** Next.js's path patterns, as far as these rules use them: `:name` and a trailing `:name*`. */
function matches(source: string, pathname: string): boolean {
  const pattern = source.replace(/\/:[A-Za-z]+\*$/, '(?:/.*)?').replace(/:[A-Za-z]+/g, '[^/]+');
  return new RegExp(`^${pattern}/?$`).test(pathname);
}

describe('M119: the pages that show Google’s map', () => {
  const mapPages = [
    '/to-rent',
    '/to-rent/',
    '/to-rent/dublin',
    '/to-rent/dublin/rathmines',
    '/to-rent/near/highfield-road-rathgar',
    '/lettings/0b0e0f2a-5f0e-4d0a-9d55-0f5a0e3f5a11/listing',
  ];
  const otherPages = [
    '/',
    '/to-rental',
    '/home/2-bed-apartment-in-ranelagh-dublin-6-7bc3c71a',
    '/development/the-weir',
    '/my/saved',
    '/sign-in',
    '/lettings',
    '/lettings/new',
    '/lettings/0b0e0f2a-5f0e-4d0a-9d55-0f5a0e3f5a11',
    '/lettings/0b0e0f2a-5f0e-4d0a-9d55-0f5a0e3f5a11/enquiries',
    '/lettings/0b0e0f2a-5f0e-4d0a-9d55-0f5a0e3f5a11/listing/preview',
    '/listings',
    '/r/some-private-token',
    '/staff/map',
  ];

  it('are the search pages and the listing editor, and nothing else', () => {
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
    const search = '/to-rent/dublin/rathmines';
    const home = '/home/2-bed-apartment-in-ranelagh-dublin-6-7bc3c71a';
    const editor = '/lettings/0b0e0f2a-5f0e-4d0a-9d55-0f5a0e3f5a11/listing';
    const enquiries = '/lettings/0b0e0f2a-5f0e-4d0a-9d55-0f5a0e3f5a11/enquiries';
    // In: Google's script would be refused under the other page's policy.
    expect(crossesMapBoundary(home, search)).toBe(true);
    expect(crossesMapBoundary(enquiries, editor)).toBe(true);
    // Out: Google's script would stay loaded where people enter personal details.
    expect(crossesMapBoundary(search, home)).toBe(true);
    expect(crossesMapBoundary(editor, enquiries)).toBe(true);
    // Within either side, pages swap in place as before.
    expect(crossesMapBoundary(search, '/to-rent/galway')).toBe(false);
    expect(crossesMapBoundary(home, '/my/saved')).toBe(false);
    expect(crossesMapBoundary(enquiries, '/lettings')).toBe(false);
  });
});
