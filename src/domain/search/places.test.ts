import { describe, expect, it } from 'vitest';
import { fixtureGazetteer } from '@/domain/places/fixture';
import {
  areaContains,
  areaHeading,
  areaPath,
  areaPhrase,
  defaultNearKm,
  nearbyPlaces,
  placePath,
  placesWithHomes,
  resolvePlacePath,
  searchArea,
  widerArea,
} from './places';

const g = fixtureGazetteer();
const place = (slug: string) => g.bySlug(slug)!;

describe('M56: turning a place into a search area', () => {
  it('reads counties, districts, places and routing keys', () => {
    expect(searchArea('dublin', g)).toMatchObject({ kind: 'county', county: 'Dublin' });
    expect(searchArea('dublin-6', g)).toMatchObject({ kind: 'routing_key', routingKey: 'D06' });
    expect(searchArea('rathmines', g)).toMatchObject({ kind: 'radius', radiusMetres: 1200 });
    expect(searchArea('a94', g)).toMatchObject({ kind: 'routing_key', routingKey: 'A94' });
    expect(searchArea('d6', g)).toMatchObject({ kind: 'routing_key', place: { slug: 'dublin-6' } });
    expect(searchArea('nowhere-at-all', g)).toBeNull();
    expect(searchArea(null, g)).toEqual({ kind: 'everywhere' });
  });

  it('M113: adds kilometres around a place, only from the list', () => {
    expect(searchArea('kinsale', g, 3)).toMatchObject({
      kind: 'radius',
      radiusMetres: 5000,
      plusKm: 3,
    });
    expect(searchArea('kinsale', g, 7)).toMatchObject({ plusKm: 0, radiusMetres: 2000 });
  });

  it('M113: searches near a street or landmark: 1 km in Dublin or a city, 3 km elsewhere', () => {
    expect(searchArea('highfield-road-rathgar-dublin-6', g)).toMatchObject({
      kind: 'near',
      withinKm: 1,
    });
    expect(searchArea('kinsalebeg', g)).toMatchObject({ kind: 'near', withinKm: 3 });
    expect(defaultNearKm(place('kinsale-road-ballyphehane-cork'), g)).toBe(1);
    expect(searchArea('highfield-road-rathgar-dublin-6', g, 2)).toMatchObject({ withinKm: 2 });
    expect(searchArea('highfield-road-rathgar-dublin-6', g, 9)).toMatchObject({ withinKm: 1 });
  });

  it('M62: names the area page', () => {
    expect(areaHeading(searchArea('rathmines', g)!)).toBe('Homes to rent in Rathmines');
    expect(areaHeading(searchArea('cork', g)!)).toBe('Homes to rent in County Cork');
    expect(areaHeading(searchArea('dublin', g)!)).toBe('Homes to rent in Dublin');
    expect(areaHeading(searchArea('dublin-6', g)!)).toBe('Homes to rent in Dublin 6');
    expect(areaPhrase(searchArea('highfield-road-rathgar-dublin-6', g)!)).toBe(
      'near Highfield Road, Rathgar',
    );
    expect(areaPhrase(searchArea('kinsale', g, 5)!)).toBe('in and around Kinsale');
  });
});

describe('M62: one web address for each place', () => {
  it('gives counties, places, streets and landmarks their address', () => {
    expect(placePath(place('dublin'))).toBe('/to-rent/dublin');
    expect(placePath(place('rathmines'))).toBe('/to-rent/dublin/rathmines');
    expect(placePath(place('naas'))).toBe('/to-rent/kildare/naas');
    expect(placePath(place('highfield-road-rathgar-dublin-6'))).toBe(
      '/to-rent/near/highfield-road-rathgar-dublin-6',
    );
    expect(areaPath({ kind: 'everywhere' })).toBe('/to-rent');
    expect(areaPath(searchArea('a94', g)!)).toBe('/to-rent/a94');
  });

  it('reads an address, and sends other spellings to the one address', () => {
    expect(resolvePlacePath([], g)).toMatchObject({ kind: 'area', path: '/to-rent' });
    expect(resolvePlacePath(['dublin', 'rathmines'], g)).toMatchObject({
      kind: 'area',
      path: '/to-rent/dublin/rathmines',
      area: { kind: 'radius' },
    });
    expect(resolvePlacePath(['cork'], g)).toMatchObject({ kind: 'area', area: { kind: 'county' } });
    expect(resolvePlacePath(['rathmines'], g)).toEqual({
      kind: 'redirect',
      path: '/to-rent/dublin/rathmines',
    });
    expect(resolvePlacePath(['d6'], g)).toEqual({
      kind: 'redirect',
      path: '/to-rent/dublin/dublin-6',
    });
    expect(resolvePlacePath(['Dublin'], g)).toEqual({ kind: 'redirect', path: '/to-rent/dublin' });
    expect(resolvePlacePath(['cork', 'rathmines'], g)).toEqual({
      kind: 'redirect',
      path: '/to-rent/dublin/rathmines',
    });
    expect(resolvePlacePath(['a94'], g)).toMatchObject({ kind: 'area', path: '/to-rent/a94' });
    expect(resolvePlacePath(['nowhere'], g)).toBeNull();
    expect(resolvePlacePath(['dublin', 'nowhere'], g)).toBeNull();
    expect(resolvePlacePath(['dublin', 'cork'], g)).toBeNull();
    expect(resolvePlacePath(['dublin', 'rathmines', 'more'], g)).toBeNull();
  });

  it('M113: reads "near" addresses, and sends places with pages to their own address', () => {
    expect(resolvePlacePath(['near', 'highfield-road-rathgar-dublin-6'], g)).toMatchObject({
      kind: 'area',
      area: { kind: 'near', place: { name: 'Highfield Road' } },
    });
    expect(resolvePlacePath(['near', 'rathmines'], g)).toEqual({
      kind: 'redirect',
      path: '/to-rent/dublin/rathmines',
    });
    expect(resolvePlacePath(['near', 'nowhere'], g)).toBeNull();
    expect(resolvePlacePath(['near'], g)).toBeNull();
  });

  it('links an area page to the places around it, nearest first', () => {
    const near = nearbyPlaces(place('rathmines'), g).map((p) => p.slug);
    expect(near.slice(0, 3)).toEqual(['dublin-6', 'ranelagh', 'portobello']);
    expect(near).not.toContain('rathmines');
    expect(near).not.toContain('dublin');
    expect(near.length).toBeLessThanOrEqual(8);
    const county = nearbyPlaces(place('kildare'), g).map((p) => p.slug);
    expect(county).toEqual(['celbridge', 'leixlip', 'maynooth', 'naas', 'newbridge']);
  });

  it('M61: grows a place by 3 km, then into its county, then all of Ireland', () => {
    expect(widerArea(searchArea('rathmines', g)!, g)).toMatchObject({ kind: 'radius', plusKm: 3 });
    expect(widerArea(searchArea('rathmines', g, 3)!, g)).toMatchObject({
      kind: 'county',
      county: 'Dublin',
    });
    expect(widerArea(searchArea('highfield-road-rathgar-dublin-6', g)!, g)).toMatchObject({
      kind: 'near',
      withinKm: 2,
    });
    expect(widerArea(searchArea('dublin-6', g)!, g)).toMatchObject({
      kind: 'county',
      county: 'Dublin',
    });
    expect(widerArea(searchArea('dublin', g)!, g)).toEqual({ kind: 'everywhere' });
    expect(widerArea(searchArea('a94', g)!, g)).toEqual({ kind: 'everywhere' });
    expect(widerArea({ kind: 'everywhere' }, g)).toBeNull();
  });
});

describe('M62, M111, M113, M57: which places a home is in', () => {
  const home = { county: 'Dublin', routingKey: 'D06', latitude: 53.3262, longitude: -6.2563 };

  it('matches a county, a district and the distance from a place', () => {
    expect(areaContains(searchArea('dublin', g)!, home)).toBe(true);
    expect(areaContains(searchArea('cork', g)!, home)).toBe(false);
    expect(areaContains(searchArea('dublin-6', g)!, home)).toBe(true);
    expect(areaContains(searchArea('dublin-8', g)!, home)).toBe(false);
    expect(areaContains(searchArea('ranelagh', g)!, home)).toBe(true);
    expect(areaContains(searchArea('howth', g)!, home)).toBe(false);
    expect(areaContains({ kind: 'everywhere' }, home)).toBe(true);
  });

  it('measures "near" from a street’s line, not just its middle', () => {
    const street = searchArea('highfield-road-rathgar-dublin-6', g, 0.5)!;
    // About 400 m from the line's east end, but over 600 m from its middle.
    const byTheEnd = { ...home, latitude: 53.3166, longitude: -6.2561 };
    expect(areaContains(street, byTheEnd)).toBe(true);
    expect(areaContains(street, { ...home, latitude: 53.33, longitude: -6.24 })).toBe(false);
  });

  it('matches a map area and a drawn shape', () => {
    const from = searchArea('rathmines', g)!;
    const box = { minLat: 53.32, maxLat: 53.33, minLng: -6.27, maxLng: -6.25 };
    expect(areaContains({ kind: 'map', box, from }, home)).toBe(true);
    const triangle = [
      { lat: 53.32, lng: -6.27 },
      { lat: 53.33, lng: -6.25 },
      { lat: 53.32, lng: -6.25 },
    ];
    const shape = { kind: 'shape' as const, polygon: triangle, box, from };
    expect(areaContains(shape, { ...home, latitude: 53.322, longitude: -6.252 })).toBe(true);
    expect(areaContains(shape, { ...home, latitude: 53.329, longitude: -6.268 })).toBe(false);
  });

  it('lists only the places with homes in them', () => {
    const slugs = placesWithHomes([home], g).map((p) => p.slug);
    expect(slugs).toContain('dublin');
    expect(slugs).toContain('dublin-6');
    expect(slugs).toContain('ranelagh');
    expect(slugs).not.toContain('cork');
    expect(slugs).not.toContain('howth');
  });
});
