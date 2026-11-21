import { describe, expect, it } from 'vitest';
import { counties } from '@/domain/lettings/new-letting';
import type { Place } from './gazetteer';
import { normalise } from './normalise';
import { otherNames, otherNamesOf, otherNamesWithoutPlace, withOtherNames } from './other-names';
import { matchQuality, rankSuggestions } from './suggest';

const landmark = (name: string, county: Place['county'], more: Partial<Place> = {}): Place => ({
  slug: normalise(`${name} ${county}`).replace(/ /g, '-'),
  name,
  kind: 'landmark',
  landmarkKind: 'college',
  county,
  centre: { lat: 53.3, lng: -6.2 },
  radiusMetres: 200,
  ...more,
});

const ucd = landmark('University College Dublin (Belfield Campus)', 'Dublin', {
  context: 'Clonskeagh, Dublin 4',
});
const ucdVillage: Place = {
  ...landmark('UCD Village', 'Dublin', { context: 'Mount Merrion, Dublin 4' }),
  kind: 'street',
  landmarkKind: undefined,
};

describe('Q60: the other names the best-known landmarks go by', () => {
  it('Q60: a landmark takes the list’s names as aliases, after its own', () => {
    expect(withOtherNames(ucd).aliases).toEqual(['UCD', 'UCD Belfield']);
    const tcd = landmark('Trinity College Dublin', 'Dublin', { aliases: ['University of Dublin'] });
    expect(withOtherNames(tcd).aliases).toEqual([
      'University of Dublin',
      'TCD',
      'Trinity',
      'Trinity College',
    ]);
    // However the index writes the name: "St. James's" and "St James’s" are the one hospital.
    expect(otherNamesOf(landmark('St James’s Hospital', 'Dublin'))).toContain("St James's");
  });

  it('Q60: a name the place already has isn’t added twice, and other places are left alone', () => {
    const dcu = landmark('Dublin City University Glasnevin Campus', 'Dublin', { aliases: ['dcu'] });
    expect(withOtherNames(dcu).aliases).toEqual(['dcu', 'DCU Glasnevin']);
    expect(withOtherNames(withOtherNames(ucd))).toEqual(withOtherNames(ucd));
    // The same name in another county, or a street of the name, is another place.
    const clare = landmark('University of Limerick', 'Clare');
    expect(withOtherNames(clare)).toBe(clare);
    const street: Place = { ...landmark('Tara Street', 'Dublin'), kind: 'street' };
    expect(withOtherNames(street)).toBe(street);
    expect(withOtherNames(ucdVillage)).toBe(ucdVillage);
  });

  it('Q60: an acronym is ranked as a name the place goes by: "ucd" is the college, then UCD Village', () => {
    expect(matchQuality('ucd', withOtherNames(ucd))).toEqual({ quality: 0.97, near: false });
    expect(matchQuality('ucd', ucd).quality).toBe(0);
    const shown = rankSuggestions('UCD', [ucdVillage, withOtherNames(ucd)]);
    expect(shown.groups.flatMap((g) => g.items.map((i) => i.name))).toEqual([
      ucd.name,
      'UCD Village',
    ]);
    expect(shown.didYouMean).toBe(false);
    const ul = withOtherNames(landmark('University of Limerick', 'Limerick'));
    expect(rankSuggestions('ul', [ul]).groups[0]?.items[0]?.name).toBe('University of Limerick');
    const mater = withOtherNames(landmark('Mater Misericordiae University Hospital', 'Dublin'));
    expect(matchQuality('the mater', mater).quality).toBe(0.97);
    const kent = withOtherNames(landmark('Cork Kent', 'Cork', { aliases: ['Cork'] }));
    expect(matchQuality('Kent Station', kent).quality).toBe(0.97);
  });

  it('Q60: the list is well formed: real counties, no row twice, no empty or repeated name', () => {
    const rows = new Set<string>();
    for (const entry of otherNames) {
      expect(counties, entry.name).toContain(entry.county);
      const row = `${normalise(entry.name)}|${entry.county}`;
      expect(rows.has(row), `${entry.name} is listed twice`).toBe(false);
      rows.add(row);
      expect(entry.names.length, entry.name).toBeGreaterThan(0);
      const names = entry.names.map(normalise);
      expect(new Set(names).size, entry.name).toBe(names.length);
      for (const name of names) {
        expect(name.length, `${entry.name}: ${name}`).toBeGreaterThanOrEqual(2);
        expect(name, entry.name).not.toBe(normalise(entry.name));
      }
    }
  });

  it('Q60: says which rows name no landmark, so a renamed one is noticed', () => {
    const all = otherNames.map((entry) => landmark(entry.name, entry.county));
    expect(otherNamesWithoutPlace(all)).toEqual([]);
    const missing = otherNamesWithoutPlace(all.filter((p) => p.name !== 'Cork Kent'));
    expect(missing.map((entry) => entry.name)).toEqual(['Cork Kent']);
  });
});
