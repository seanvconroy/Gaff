import { describe, expect, it } from 'vitest';
import { fixtureGazetteer } from '@/domain/places/fixture';
import type { Place } from '@/domain/places/gazetteer';
import {
  canonicalSearchPath,
  type CountedPlace,
  hasPlacePage,
  nearbyPlaces,
  placePageName,
  placePageRobots,
  placePath,
  placesWithHomes,
  resolvePlacePath,
  widerPlacesWithHomes,
} from './place-pages';
import { searchPlace } from './places';

const g = fixtureGazetteer();
const place = (slug: string): Place => {
  const found = g.bySlug(slug);
  if (!found) throw new Error(`No place ${slug}`);
  return found;
};
const counted = (homes: Record<string, number>): CountedPlace[] =>
  g.places.map((p) => ({ ...p, liveHomes: homes[p.slug] ?? 0 }));

describe('M62: one web address for each place', () => {
  it('M62: gives counties and the places in them their address', () => {
    expect(placePath(place('dublin'))).toBe('/to-rent/dublin');
    expect(placePath(place('cork'))).toBe('/to-rent/cork');
    expect(placePath(place('ranelagh'))).toBe('/to-rent/dublin/ranelagh');
    expect(placePath(place('dublin-6'))).toBe('/to-rent/dublin/dublin-6');
    expect(placePath(place('naas'))).toBe('/to-rent/kildare/naas');
    expect(placePath(place('cork-city'))).toBe('/to-rent/cork/cork-city');
  });

  it('M62, M113: every area has a page; a street, landmark or townland is searched near', () => {
    for (const p of g.places) expect(hasPlacePage(p), p.slug).toBe(true);
    expect(hasPlacePage(place('highfield-road-rathgar-dublin-6'))).toBe(false);
    expect(hasPlacePage(place('heuston-station-dublin-8'))).toBe(false);
  });

  it('M62: reads a place’s own address as its page', () => {
    expect(resolvePlacePath(['dublin', 'ranelagh'], g)).toMatchObject({
      kind: 'page',
      path: '/to-rent/dublin/ranelagh',
      place: { slug: 'ranelagh' },
    });
    expect(resolvePlacePath(['cork'], g)).toMatchObject({
      kind: 'page',
      place: { kind: 'county', county: 'Cork' },
    });
  });

  it('M62: sends other spellings and old addresses to the one address', () => {
    const to = (segments: string[]) => resolvePlacePath(segments, g);
    expect(to(['ranelagh'])).toEqual({ kind: 'redirect', path: '/to-rent/dublin/ranelagh' });
    expect(to(['Dublin'])).toEqual({ kind: 'redirect', path: '/to-rent/dublin' });
    expect(to(['DUBLIN', 'Ranelagh'])).toEqual({
      kind: 'redirect',
      path: '/to-rent/dublin/ranelagh',
    });
    expect(to(['cork', 'ranelagh'])).toEqual({
      kind: 'redirect',
      path: '/to-rent/dublin/ranelagh',
    });
    expect(to(['d06'])).toEqual({ kind: 'redirect', path: '/to-rent/dublin/dublin-6' });
    expect(to(['dublin', 'd06'])).toEqual({ kind: 'redirect', path: '/to-rent/dublin/dublin-6' });
    expect(to(['dublin', 'D%C3%BAn%20Laoghaire'])).toEqual({
      kind: 'redirect',
      path: '/to-rent/dublin/dun-laoghaire',
    });
    // The redesign's first list named a few places differently (LEGACY_PLACE_IDS).
    expect(to(['kerry', 'dingle'])).toEqual({
      kind: 'redirect',
      path: '/to-rent/kerry/dingle-daingean-ui-chuis',
    });
    expect(to(['dublin', 'dublin'])).toEqual({ kind: 'redirect', path: '/to-rent/dublin' });
    // The live line's address for all homes, and for a search near a street.
    expect(to([])).toEqual({ kind: 'redirect', path: '/' });
    expect(to(['near', 'highfield-road-rathgar-dublin-6'])).toEqual({
      kind: 'redirect',
      path: '/?where=highfield-road-rathgar-dublin-6',
    });
    expect(to(['near', 'ranelagh'])).toEqual({
      kind: 'redirect',
      path: '/to-rent/dublin/ranelagh',
    });
    expect(to(['dublin', 'highfield-road-rathgar-dublin-6'])).toEqual({
      kind: 'redirect',
      path: '/?where=highfield-road-rathgar-dublin-6',
    });
    // An Eircode area that isn't a Dublin district has no page: its search does.
    expect(to(['p17'])).toEqual({ kind: 'redirect', path: '/?where=p17' });
  });

  it('M62: an address that names no place Gaff knows is not found', () => {
    const to = (segments: string[]) => resolvePlacePath(segments, g);
    expect(to(['narnia'])).toBeNull();
    expect(to(['dublin', 'narnia'])).toBeNull();
    expect(to(['dublin', 'ranelagh', 'more'])).toBeNull();
    expect(to(['near'])).toBeNull();
    expect(to(['near', 'narnia'])).toBeNull();
    expect(to(['narnia', 'highfield-road-rathgar-dublin-6'])).toBeNull();
    expect(to(['%E0%A4%A'])).toBeNull();
  });

  it('M62: names the place as its page does', () => {
    expect(placePageName(place('ranelagh'))).toBe('Ranelagh');
    expect(placePageName(place('dublin'))).toBe('Dublin');
    expect(placePageName(place('cork'))).toBe('County Cork');
    expect(placePageName(place('dublin-6'))).toBe('Dublin 6');
    expect(placePageName(place('dingle-daingean-ui-chuis'))).toBe('Dingle');
  });
});

describe('M62: the places a place’s page links to', () => {
  it('M62: links a place to the places around it in its county, nearest first', () => {
    const near = nearbyPlaces(place('rathmines'), counted({}));
    expect(near.slice(0, 3).map((p) => p.slug)).toEqual(['dublin-6', 'ranelagh', 'portobello']);
    expect(near.map((p) => p.slug)).not.toContain('rathmines');
    expect(near.map((p) => p.kind)).not.toContain('county');
    expect(near.length).toBeLessThanOrEqual(8);
  });

  it('M62: links a county to its towns, those with homes first', () => {
    const county = nearbyPlaces(place('kildare'), counted({ naas: 2 })).map((p) => p.slug);
    expect(county[0]).toBe('naas');
    expect(county).toEqual(
      expect.arrayContaining(['celbridge', 'leixlip', 'maynooth', 'newbridge']),
    );
    expect(county).not.toContain('kildare');
  });

  it('M62, M61: offers a place with no homes the nearest places that have some, then its county', () => {
    const wider = widerPlacesWithHomes(
      place('rush'),
      counted({ ranelagh: 2, 'dublin-6': 2, dublin: 3, kinsale: 1 }),
    );
    expect(wider.map((p) => p.slug)).toEqual(['ranelagh', 'dublin-6', 'kinsale', 'dublin']);
    expect(widerPlacesWithHomes(place('rush'), counted({}))).toEqual([]);
  });
});

describe('M111, M58: what search engines are told', () => {
  it('M111: lists only places with homes in them', () => {
    const slugs = placesWithHomes(counted({ ranelagh: 1, dublin: 1 })).map((p) => p.slug);
    expect(slugs.sort()).toEqual(['dublin', 'ranelagh']);
  });

  it('M58: a search for a place alone has that place’s page as its address', () => {
    const where = (slug: string) => searchPlace(slug, g);
    expect(canonicalSearchPath({}, null)).toBe('/');
    expect(canonicalSearchPath({ where: 'ranelagh' }, where('ranelagh'))).toBe(
      '/to-rent/dublin/ranelagh',
    );
    expect(canonicalSearchPath({ where: 'cork' }, where('cork'))).toBe('/to-rent/cork');
    // Filters, a place searched near, an Eircode area: no canonical page, never indexed.
    expect(canonicalSearchPath({ where: 'ranelagh', beds: 2 }, where('ranelagh'))).toBeNull();
    expect(canonicalSearchPath({ beds: 2 }, null)).toBeNull();
    const street = 'highfield-road-rathgar-dublin-6';
    expect(canonicalSearchPath({ where: street }, where(street))).toBeNull();
    expect(canonicalSearchPath({ where: 'p17' }, where('p17'))).toBeNull();
  });

  it('M111, UX-LS-11: a place’s page is indexed only with SEARCH_INDEXING on and a home in it', () => {
    expect(placePageRobots({ liveHomes: 2, searchIndexing: true })).toEqual({
      index: true,
      follow: true,
    });
    expect(placePageRobots({ liveHomes: 0, searchIndexing: true })).toEqual({
      index: false,
      follow: true,
    });
    expect(placePageRobots({ liveHomes: 2, searchIndexing: false })).toEqual({
      index: false,
      follow: false,
    });
  });
});
