import { describe, expect, it } from 'vitest';
import { curatedPlaces, fixturePlaces } from '@/domain/places/fixture';
import type { PlaceFileHeader } from '@/domain/places/file';
import type { Place } from '@/domain/places/gazetteer';
import { checkExpectation, checkPlaces, readTestSet } from './quality';

const header = (count: number): PlaceFileHeader => ({
  version: 20261108,
  built: '2026-11-08',
  source: 'OpenStreetMap (Geofabrik extract) and Gaff',
  count,
  attribution: ['© OpenStreetMap contributors (ODbL 1.0)'],
});

describe('ADR-0027, M56: checking a built place index before it is committed', () => {
  it('reads the test set, and refuses a malformed one', () => {
    const csv = [
      '# Places renters must find.',
      'query,name,where,within',
      '',
      'Kinsale,Kinsale,Cork,1',
      'Highfield Road, Highfield Road , Rathgar ,3',
    ].join('\n');
    expect(readTestSet(csv)).toEqual([
      { query: 'Kinsale', name: 'Kinsale', where: 'Cork', within: 1 },
      { query: 'Highfield Road', name: 'Highfield Road', where: 'Rathgar', within: 3 },
    ]);
    expect(() => readTestSet('Kinsale,Kinsale,Cork,1')).toThrow(/starts with/);
    expect(() => readTestSet('query,name,where,within\nKinsale,Kinsale,Cork,first')).toThrow(
      /line 2/,
    );
  });

  it('passes a whole index, and names what is wrong with a broken one', () => {
    expect(checkPlaces(header(fixturePlaces.length), fixturePlaces, {})).toEqual([]);

    const broken: Place[] = [
      ...curatedPlaces.filter((p) => p.county !== 'Leitrim' && p.slug !== 'rathmines'),
      { ...curatedPlaces[0]!, name: 'A copy' },
      { ...curatedPlaces[1]!, slug: 'paris', centre: { lat: 48.86, lng: 2.35 } },
      {
        ...curatedPlaces.find((p) => p.slug === 'galway-city')!,
        slug: 'cathair-na-gaillimhe',
        name: 'Cathair na Gaillimhe',
      },
    ];
    const problems = checkPlaces(header(broken.length + 1), broken, { street: 1 });
    expect(problems).toEqual([
      `The header says ${broken.length + 1} places, but the file has ${broken.length}.`,
      `Slugs used twice: ${curatedPlaces[0]!.slug}.`,
      'Counties missing: Leitrim.',
      expect.stringMatching(/^Curated places missing: .*rathmines/),
      'Cities that aren’t curated (a second copy of one?): cathair-na-gaillimhe.',
      'Places outside Ireland: paris.',
      'Only 0 of kind street; expected at least 1.',
    ]);
  });

  it('finds the expected place within its position, forgiving case and fadas', () => {
    const shown = [
      { name: 'Highfield', context: 'Area in Cork city', county: 'Cork' },
      { name: 'Highfield Road', context: 'Rathgar, Dublin 6', county: 'Dublin' },
      { name: 'Highfield Road', context: 'Ballintemple, Cork', county: 'Cork' },
    ];
    const expected = { query: 'Highfield r', name: 'highfield road', where: 'Cork', within: 3 };
    expect(checkExpectation(expected, shown)).toBeNull();
    expect(checkExpectation({ ...expected, within: 2 }, shown)).toBe(
      '"Highfield r" suggested highfield road, Cork at 3, not within 2. First: Highfield (Area in Cork city); Highfield Road (Rathgar, Dublin 6); Highfield Road (Ballintemple, Cork).',
    );
    expect(
      checkExpectation({ query: 'Dun', name: 'Dún Laoghaire', where: '', within: 1 }, [
        { name: 'Dun Laoghaire', context: null, county: 'Dublin' },
      ]),
    ).toBeNull();
    expect(checkExpectation({ ...expected, name: 'Kinsale' }, [])).toBe(
      '"Highfield r" didn\'t suggest Kinsale, Cork. It suggested: nothing.',
    );
  });
});
