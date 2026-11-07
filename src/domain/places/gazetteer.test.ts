import { describe, expect, it } from 'vitest';
import { counties } from '@/domain/lettings/new-letting';
import { dublinDistricts } from './eircode';
import { places, placeBySlug } from './gazetteer';
import { inIreland } from './geo';
import { slugify } from './slug';

describe('M56: the places renters search by', () => {
  it('has a unique slug for every place', () => {
    const slugs = places.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toBe(slugify(slug));
  });

  it('covers every county and every Dublin district', () => {
    for (const county of counties) {
      expect(placeBySlug(slugify(county))?.kind).toBe('county');
    }
    for (const { routingKey } of dublinDistricts) {
      expect(places.find((p) => p.routingKey === routingKey)?.kind).toBe('district');
    }
  });

  it('puts every place in Ireland, with a sensible radius', () => {
    for (const place of places) {
      expect(inIreland(place.centre), place.name).toBe(true);
      expect(place.radiusMetres).toBeGreaterThanOrEqual(500);
    }
  });

  it('finds places by slug', () => {
    expect(placeBySlug('dun-laoghaire')?.aliases).toContain('Dun Laoghaire');
    expect(placeBySlug('dublin-6')?.routingKey).toBe('D06');
    expect(placeBySlug('cork-city')?.county).toBe('Cork');
  });
});
