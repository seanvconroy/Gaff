import { describe, expect, it } from 'vitest';
import { fixtureGazetteer } from './fixture';
import { approximateLocation as locate } from './locate';

const g = fixtureGazetteer();
const approximateLocation = (home: Parameters<typeof locate>[0]) => locate(home, g);

describe('M38: an approximate location until the letter places a pin', () => {
  it('uses the most specific named area', () => {
    const found = approximateLocation({
      area: 'Ranelagh, Dublin 6',
      county: 'Dublin',
      routingKey: 'D06',
    });
    expect(found).toMatchObject({ source: 'area', place: { slug: 'ranelagh' } });
    expect(
      approximateLocation({
        area: "Harold's Cross, Dublin 6W",
        county: 'Dublin',
        routingKey: 'D6W',
      }),
    ).toMatchObject({ source: 'area', place: { slug: 'harolds-cross' } });
    expect(
      approximateLocation({ area: 'Dun Laoghaire', county: 'Dublin', routingKey: null }).place.slug,
    ).toBe('dun-laoghaire');
  });

  it('falls back to the Dublin district, then the county', () => {
    expect(
      approximateLocation({ area: 'Somewhere new, Dublin 6', county: 'Dublin', routingKey: 'D06' }),
    ).toMatchObject({ source: 'district', place: { slug: 'dublin-6' } });
    expect(
      approximateLocation({ area: 'Ballyfin', county: 'Laois', routingKey: 'R32' }),
    ).toMatchObject({ source: 'county', place: { slug: 'laois' } });
  });

  it('doesn’t match an area in another county', () => {
    expect(
      approximateLocation({ area: 'Blackrock', county: 'Louth', routingKey: null }).source,
    ).toBe('county');
  });
});
