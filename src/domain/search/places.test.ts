import { describe, expect, it } from 'vitest';
import { counties } from '@/domain/lettings/new-letting';
import {
  normalise,
  placeById,
  placeHasHome,
  placeInSentence,
  placeLabel,
  places,
  searchPlaces,
} from './places';

const home = (over: Partial<Parameters<typeof placeHasHome>[1]> = {}) => ({
  addressLine1: '12 Ranelagh Road',
  addressLine2: null,
  area: 'Ranelagh, Dublin 6',
  county: 'Dublin',
  eircode: null,
  ...over,
});

describe('UX-SR-5: Gaff’s own list of Irish places', () => {
  it('UX-SR-5: has every county, every Dublin postal district, towns and neighbourhoods', () => {
    for (const county of counties) {
      expect(places.some((p) => p.kind === 'county' && p.name === county)).toBe(true);
    }
    const districts = places.filter((p) => p.kind === 'district').map((p) => p.name);
    expect(districts).toContain('Dublin 6W');
    expect(districts).toContain('Dublin 24');
    expect(districts).not.toContain('Dublin 19');
    expect(places.filter((p) => p.kind === 'town').length).toBeGreaterThan(100);
    expect(placeById('ranelagh')?.context).toBe('Dublin 6');
  });

  it('UX-SR-5: every place has its own ID', () => {
    const ids = places.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('UX-SR-5: names places as people say them', () => {
    expect(placeLabel(placeById('ranelagh')!)).toBe('Ranelagh, Dublin 6');
    expect(placeLabel(placeById('bray')!)).toBe('Bray, Co. Wicklow');
    expect(placeLabel(placeById('cork')!)).toBe('Co. Cork');
    expect(placeLabel(placeById('dublin')!)).toBe('Dublin');
    expect(placeLabel(placeById('dublin-6w')!)).toBe('Dublin 6W');
  });

  it('UX-SR-5: compares names without accents, apostrophes or capitals', () => {
    expect(normalise('Dún Laoghaire')).toBe('dun laoghaire');
    expect(normalise('Harold’s Cross')).toBe('harolds cross');
  });
});

describe('UX-SR-3: the place a sentence names', () => {
  it('UX-SR-3: finds the most specific place said', () => {
    expect(placeInSentence('2-bed in Ranelagh, Dublin 6')?.id).toBe('ranelagh');
    expect(placeInSentence('something in dublin 6w please')?.id).toBe('dublin-6w');
    expect(placeInSentence('D8 or thereabouts')?.id).toBe('dublin-8');
    expect(placeInSentence('a house in Bray')?.id).toBe('bray');
    expect(placeInSentence('anywhere in Cork')?.id).toBe('cork');
    expect(placeInSentence('Dun Laoghaire')?.id).toBe('dun-laoghaire');
    expect(placeInSentence('harolds cross')?.id).toBe('harolds-cross');
  });

  it('UX-SR-3: a name that is also a word or a first name needs "in" before it', () => {
    expect(placeInSentence('no rush, from January')).toBeNull();
    expect(placeInSentence('a flat in Rush')?.id).toBe('rush');
    expect(placeInSentence('Clare here, looking for a 2-bed')).toBeNull();
    expect(placeInSentence('a house in county Clare')?.id).toBe('clare');
  });

  it('UX-SR-3: a place Gaff doesn’t know is nothing', () => {
    expect(placeInSentence('a castle in Narnia')).toBeNull();
  });
});

describe('UX-SR-4: the place search under "Where"', () => {
  it('UX-SR-4: finds places by the start of their name or a word of it', () => {
    expect(searchPlaces('ranel').map((p) => p.id)).toEqual(['ranelagh']);
    expect(searchPlaces('cross').map((p) => p.id)).toContain('harolds-cross');
    expect(
      searchPlaces('dublin 6')
        .map((p) => p.id)
        .slice(0, 2),
    ).toEqual(['dublin-6', 'dublin-6w']);
    expect(searchPlaces('')).toEqual([]);
  });
});

describe('UX-SR-4: a place is matched against the home’s address', () => {
  it('UX-SR-4: a neighbourhood is its name in the address, in the same county', () => {
    expect(placeHasHome(placeById('ranelagh')!, home())).toBe(true);
    expect(placeHasHome(placeById('rathmines')!, home())).toBe(false);
    expect(placeHasHome(placeById('ranelagh')!, home({ county: 'Cork' }))).toBe(false);
  });

  it('UX-SR-4: a district is written in the address or is its Eircode’s routing key', () => {
    expect(placeHasHome(placeById('dublin-6')!, home())).toBe(true);
    expect(placeHasHome(placeById('dublin-6w')!, home())).toBe(false);
    expect(
      placeHasHome(placeById('dublin-6w')!, home({ area: 'Terenure', eircode: 'D6W XY12' })),
    ).toBe(true);
  });

  it('UX-SR-4: a county is the home’s county', () => {
    expect(placeHasHome(placeById('dublin')!, home())).toBe(true);
    expect(placeHasHome(placeById('wicklow')!, home())).toBe(false);
  });
});
