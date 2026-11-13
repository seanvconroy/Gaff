import { describe, expect, it } from 'vitest';
import { counties } from '@/domain/lettings/new-letting';
import { dublinDistricts } from './eircode';
import { fixtureGazetteer, fixturePlaces } from './fixture';
import { gazetteer, hasAreaPage } from './gazetteer';
import { inIreland } from './geo';
import { slugify } from './slug';

describe('M56: the places renters search by (the fixture)', () => {
  const g = fixtureGazetteer();

  it('has a unique slug for every place', () => {
    const slugs = fixturePlaces.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toBe(slugify(slug));
  });

  it('covers every county and every Dublin district', () => {
    for (const county of counties) {
      expect(g.bySlug(slugify(county))?.kind).toBe('county');
      expect(g.county(county)?.name).toBe(county);
    }
    for (const { routingKey } of dublinDistricts) {
      expect(g.byRoutingKey(routingKey)?.kind).toBe('district');
    }
  });

  it('puts every place in Ireland; places with pages reach at least 500 m', () => {
    for (const place of fixturePlaces) {
      expect(inIreland(place.centre), place.name).toBe(true);
      if (hasAreaPage(place)) expect(place.radiusMetres).toBeGreaterThanOrEqual(500);
    }
  });

  it('finds places by slug', () => {
    expect(g.bySlug('dun-laoghaire')?.aliases).toContain('Dun Laoghaire');
    expect(g.bySlug('dublin-6')?.routingKey).toBe('D06');
    expect(g.bySlug('cork-city')).toMatchObject({ county: 'Cork', kind: 'city' });
    expect(g.bySlug('kinsale')?.irishName).toBe('Cionn tSáile');
  });
});

describe('M62, M113: which places have area pages', () => {
  it('lists only counties, cities, towns, villages, districts and areas', () => {
    const g = fixtureGazetteer();
    const kinds = new Set(g.places.map((p) => p.kind));
    expect([...kinds].sort()).toEqual(['area', 'city', 'county', 'district', 'town', 'village']);
    expect(g.bySlug('highfield-road-rathgar-dublin-6')?.kind).toBe('street');
  });

  it('finds streets and landmarks passed in for one search', () => {
    const street = fixturePlaces.find((p) => p.kind === 'street')!;
    const g = gazetteer(fixturePlaces.filter(hasAreaPage), [street]);
    expect(g.bySlug(street.slug)).toBe(street);
    expect(g.places).not.toContain(street);
  });
});
