import { describe, expect, it } from 'vitest';
import { placeBySlug } from '@/domain/places/gazetteer';
import {
  areaHeading,
  areaContains,
  areaPath,
  nearbyPlaces,
  placePath,
  placesWithHomes,
  resolvePlacePath,
  searchArea,
  suggestPlaces,
  widerArea,
} from './places';

describe('M56: finding the place a renter types', () => {
  it('suggests places as they type, most likely first', () => {
    expect(suggestPlaces('rath').map((p) => p.slug)).toEqual([
      'rathfarnham',
      'rathgar',
      'rathmines',
    ]);
    expect(suggestPlaces('dublin 6')[0]?.slug).toBe('dublin-6');
    expect(suggestPlaces('D6W')[0]?.slug).toBe('dublin-6w');
    expect(suggestPlaces('cork')[0]?.slug).toBe('cork');
    expect(suggestPlaces('Dun L')[0]?.slug).toBe('dun-laoghaire');
    expect(suggestPlaces('r')).toEqual([]);
    expect(suggestPlaces('County Sligo')[0]?.slug).toBe('sligo');
    expect(suggestPlaces('Co. Kerry')[0]?.slug).toBe('kerry');
    expect(suggestPlaces('County Dublin')[0]?.slug).toBe('dublin');
  });

  it('turns a place into a search area', () => {
    expect(searchArea('dublin')).toMatchObject({ kind: 'county', county: 'Dublin' });
    expect(searchArea('dublin-6')).toMatchObject({ kind: 'routing_key', routingKey: 'D06' });
    expect(searchArea('rathmines')).toMatchObject({ kind: 'radius', radiusMetres: 1200 });
    expect(searchArea('a94')).toMatchObject({ kind: 'routing_key', routingKey: 'A94' });
    expect(searchArea('nowhere-at-all')).toBeNull();
    expect(searchArea(null)).toEqual({ kind: 'everywhere' });
  });

  it('M62: names the area page', () => {
    expect(areaHeading(searchArea('rathmines')!)).toBe('Homes to rent in Rathmines');
    expect(areaHeading(searchArea('cork')!)).toBe('Homes to rent in County Cork');
    expect(areaHeading(searchArea('dublin-6')!)).toBe('Homes to rent in Dublin 6');
  });
});

describe('M62: one web address for each place', () => {
  it('gives counties and places their address', () => {
    expect(placePath(placeBySlug('dublin')!)).toBe('/to-rent/dublin');
    expect(placePath(placeBySlug('rathmines')!)).toBe('/to-rent/dublin/rathmines');
    expect(placePath(placeBySlug('naas')!)).toBe('/to-rent/kildare/naas');
    expect(areaPath({ kind: 'everywhere' })).toBe('/to-rent');
    expect(areaPath(searchArea('a94')!)).toBe('/to-rent/a94');
  });

  it('reads an address, and sends other spellings to the one address', () => {
    expect(resolvePlacePath([])).toMatchObject({ kind: 'area', path: '/to-rent' });
    expect(resolvePlacePath(['dublin', 'rathmines'])).toMatchObject({
      kind: 'area',
      path: '/to-rent/dublin/rathmines',
      area: { kind: 'radius' },
    });
    expect(resolvePlacePath(['cork'])).toMatchObject({ kind: 'area', area: { kind: 'county' } });
    expect(resolvePlacePath(['rathmines'])).toEqual({
      kind: 'redirect',
      path: '/to-rent/dublin/rathmines',
    });
    expect(resolvePlacePath(['d6'])).toEqual({
      kind: 'redirect',
      path: '/to-rent/dublin/dublin-6',
    });
    expect(resolvePlacePath(['Dublin'])).toEqual({ kind: 'redirect', path: '/to-rent/dublin' });
    expect(resolvePlacePath(['cork', 'rathmines'])).toEqual({
      kind: 'redirect',
      path: '/to-rent/dublin/rathmines',
    });
    expect(resolvePlacePath(['a94'])).toMatchObject({ kind: 'area', path: '/to-rent/a94' });
    expect(resolvePlacePath(['nowhere'])).toBeNull();
    expect(resolvePlacePath(['dublin', 'nowhere'])).toBeNull();
    expect(resolvePlacePath(['dublin', 'cork'])).toBeNull();
    expect(resolvePlacePath(['dublin', 'rathmines', 'more'])).toBeNull();
  });

  it('links an area page to the places around it, nearest first', () => {
    const near = nearbyPlaces(placeBySlug('rathmines')!).map((p) => p.slug);
    expect(near.slice(0, 3)).toEqual(['dublin-6', 'ranelagh', 'portobello']);
    expect(near).toContain('ranelagh');
    expect(near).not.toContain('rathmines');
    expect(near).not.toContain('dublin');
    expect(near.length).toBeLessThanOrEqual(8);
    const county = nearbyPlaces(placeBySlug('kildare')!).map((p) => p.slug);
    expect(county).toEqual(['celbridge', 'leixlip', 'maynooth', 'naas', 'newbridge']);
  });

  it('M61: grows an area into its county, then all of Ireland', () => {
    expect(widerArea(searchArea('rathmines')!)).toMatchObject({ kind: 'county', county: 'Dublin' });
    expect(widerArea(searchArea('dublin-6')!)).toMatchObject({ kind: 'county', county: 'Dublin' });
    expect(widerArea(searchArea('dublin')!)).toEqual({ kind: 'everywhere' });
    expect(widerArea(searchArea('a94')!)).toEqual({ kind: 'everywhere' });
    expect(widerArea({ kind: 'everywhere' })).toBeNull();
  });
});

describe('M62, M111: which places a home is in', () => {
  const home = { county: 'Dublin', routingKey: 'D06', latitude: 53.3262, longitude: -6.2563 };

  it('matches a county, a district and the distance from a place', () => {
    expect(areaContains(searchArea('dublin')!, home)).toBe(true);
    expect(areaContains(searchArea('cork')!, home)).toBe(false);
    expect(areaContains(searchArea('dublin-6')!, home)).toBe(true);
    expect(areaContains(searchArea('dublin-8')!, home)).toBe(false);
    expect(areaContains(searchArea('ranelagh')!, home)).toBe(true);
    expect(areaContains(searchArea('howth')!, home)).toBe(false);
    expect(areaContains({ kind: 'everywhere' }, home)).toBe(true);
  });

  it('lists only the places with homes in them', () => {
    const slugs = placesWithHomes([home]).map((p) => p.slug);
    expect(slugs).toContain('dublin');
    expect(slugs).toContain('dublin-6');
    expect(slugs).toContain('ranelagh');
    expect(slugs).not.toContain('cork');
    expect(slugs).not.toContain('howth');
  });
});
