import { describe, expect, it } from 'vitest';
import { fixtureGazetteer } from '@/domain/places/fixture';
import { encodePolyline } from '@/domain/places/geo';
import { readBBox, readSearch, readShape, savedSearchArea, searchHref, writeBBox } from './url';

const g = fixtureGazetteer();
const read = (path: string) => {
  const [pathname, query = ''] = path.split('?');
  return readSearch(pathname!.split('/').filter(Boolean).slice(1), new URLSearchParams(query), g);
};
const roundTrip = (path: string) => {
  const r = read(path);
  if (r?.kind !== 'search') throw new Error(`not a search: ${path}`);
  return searchHref(r.search.area, r.search.filters, r.search.view);
};

describe('M58, M113, M57: the web address is the search', () => {
  it('reads and writes the same address, in one order', () => {
    expect(roundTrip('/to-rent/dublin/rathmines?beds=2&max=2400')).toBe(
      '/to-rent/dublin/rathmines?max=2400&beds=2',
    );
    expect(roundTrip('/to-rent/cork/kinsale?km=3&sort=cheapest&min=1500')).toBe(
      '/to-rent/cork/kinsale?min=1500&km=3&sort=cheapest',
    );
    expect(roundTrip('/to-rent/near/highfield-road-rathgar-dublin-6')).toBe(
      '/to-rent/near/highfield-road-rathgar-dublin-6',
    );
    expect(roundTrip('/to-rent/near/highfield-road-rathgar-dublin-6?km=2')).toBe(
      '/to-rent/near/highfield-road-rathgar-dublin-6?km=2',
    );
    expect(roundTrip('/to-rent?view=map&beds=1')).toBe('/to-rent?beds=1&view=map');
    expect(roundTrip('/to-rent/dublin/rathmines?page=2&sort=newest')).toBe(
      '/to-rent/dublin/rathmines?sort=newest&page=2',
    );
  });

  it('M57: keeps a map area, and the place it started from', () => {
    const box = '-6.28,53.31,-6.24,53.33';
    const r = read(`/to-rent/dublin/rathmines?bbox=${box}`);
    expect(r).toMatchObject({
      kind: 'search',
      search: { area: { kind: 'map', from: { kind: 'radius', place: { slug: 'rathmines' } } } },
    });
    expect(roundTrip(`/to-rent/dublin/rathmines?bbox=${box}`)).toBe(
      `/to-rent/dublin/rathmines?bbox=${encodeURIComponent(box)}`,
    );
  });

  it('M56: keeps a drawn shape, and refuses one that is too big or detailed', () => {
    const triangle = [
      { lat: 53.32, lng: -6.27 },
      { lat: 53.33, lng: -6.25 },
      { lat: 53.32, lng: -6.25 },
    ];
    const shape = encodePolyline(triangle);
    expect(readShape(shape)).toHaveLength(3);
    expect(read(`/to-rent?shape=${encodeURIComponent(shape)}`)).toMatchObject({
      search: { area: { kind: 'shape' } },
    });
    const huge = encodePolyline([
      { lat: 51.5, lng: -10 },
      { lat: 55, lng: -10 },
      { lat: 55, lng: -6 },
    ]);
    expect(readShape(huge)).toBeNull();
    const detailed = encodePolyline(
      Array.from({ length: 101 }, (_, i) => ({
        lat: 53.3 + 0.01 * Math.sin((i / 101) * 2 * Math.PI),
        lng: -6.26 + 0.01 * Math.cos((i / 101) * 2 * Math.PI),
      })),
    );
    expect(readShape(detailed)).toBeNull();
    expect(readShape('not a polyline!')).toBeNull();
  });

  it('refuses boxes that are upside down, outside Ireland or too big', () => {
    expect(readBBox('-6.28,53.31,-6.24,53.33')).not.toBeNull();
    expect(readBBox('-6.24,53.31,-6.28,53.33')).toBeNull();
    expect(readBBox('2.3,48.8,2.4,48.9')).toBeNull();
    expect(readBBox('-13.8,51,-2.2,55.8')).not.toBeNull();
    expect(readBBox('-20,45,0,62')).toBeNull();
    expect(readBBox('nonsense')).toBeNull();
    expect(writeBBox({ minLat: 53.310001, minLng: -6.28, maxLat: 53.33, maxLng: -6.24 })).toBe(
      '-6.28,53.31,-6.24,53.33',
    );
  });

  it('redirects other spellings, keeping the query', () => {
    expect(read('/to-rent/rathmines?beds=2')).toEqual({
      kind: 'redirect',
      path: '/to-rent/dublin/rathmines?beds=2',
    });
    expect(read('/to-rent/nowhere')).toBeNull();
  });

  it('M86: reads a saved search’s area from its address and query', () => {
    expect(savedSearchArea('/to-rent/cork/kinsale', 'km=5', g)).toMatchObject({
      kind: 'radius',
      plusKm: 5,
    });
    expect(savedSearchArea('/to-rent/near/heuston-station-dublin-8', 'km=2', g)).toMatchObject({
      kind: 'near',
      withinKm: 2,
    });
    expect(savedSearchArea('/to-rent/nowhere', '', g)).toBeNull();
  });
});
