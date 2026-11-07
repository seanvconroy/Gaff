import { describe, expect, it } from 'vitest';
import { distanceMetres } from '@/domain/places/geo';
import {
  addressShown,
  buildPublicListing,
  listingSlug,
  listingTitle,
  type ProjectionInput,
} from './projection';

const input: ProjectionInput = {
  listingId: '1a2b3c4d-0000-4000-8000-000000000000',
  organisationId: 'org',
  slug: 'slug',
  status: 'live',
  home: {
    addressLine1: 'Apartment 4, 12 Ranelagh Road',
    addressLine2: null,
    area: 'Ranelagh, Dublin 6',
    county: 'Dublin',
    routingKey: 'D06',
    latitude: 53.3262,
    longitude: -6.2563,
    showExactAddress: false,
    propertyType: 'apartment',
    bedrooms: 2,
    bathrooms: 1,
    ensuites: null,
    floorAreaSqm: 75,
    floor: 2,
    hasLift: true,
    ber: { kind: 'rated', scale: 'previous', rating: 'C1' },
    heating: 'gas',
    parking: 'street',
    outdoorSpace: 'balcony',
    accessibility: ['lift'],
    appliances: ['washing_machine'],
    broadband: 'fibre',
    developmentId: null,
  },
  rentCents: 250_000,
  depositCents: 250_000,
  availableFrom: '2026-12-01',
  furnished: 'furnished',
  criteria: { noPets: true, maxOccupants: 2 },
  enquiriesCloseAt: null,
  description: 'A bright apartment.',
  tourUrl: null,
  photos: [],
  letter: {
    kind: 'agency',
    name: 'Halcyon Lettings',
    agentName: 'Ann Power',
    agentPhone: null,
    badges: [],
  },
  publishedAt: new Date('2026-11-07T10:00:00Z'),
  confirmedAt: new Date('2026-11-07T10:00:00Z'),
};

describe('ADR-0017: the public projection of a listing', () => {
  it('names the home renters understand', () => {
    expect(listingTitle(input.home)).toBe('2 bed apartment in Ranelagh, Dublin 6');
    expect(listingTitle({ ...input.home, propertyType: 'studio', bedrooms: 0 })).toBe(
      'Studio in Ranelagh, Dublin 6',
    );
  });

  it('M38: shows only the street and area, and an approximate point, when asked', () => {
    expect(addressShown(input.home)).toBe('Ranelagh Road, Ranelagh, Dublin 6');
    expect(addressShown({ ...input.home, showExactAddress: true })).toBe(
      'Apartment 4, 12 Ranelagh Road, Ranelagh, Dublin 6',
    );
    const row = buildPublicListing(input);
    const moved = distanceMetres(
      { lat: row.latitude, lng: row.longitude },
      { lat: input.home.latitude, lng: input.home.longitude },
    );
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(150);
  });

  it('carries the criteria in words, and pets considered unless the letter said no', () => {
    const row = buildPublicListing(input, new Date('2026-11-07T10:00:00Z'));
    expect(row.criteria).toEqual([
      'Up to 2 people',
      'No pets (assistance dogs are always welcome)',
    ]);
    expect(row.petsConsidered).toBe(false);
    expect(row.berLabel).toBe('BER C1');
    expect(row.berBand).toBe('C');
  });

  it('never carries the Eircode or anyone’s contact details', () => {
    const row = buildPublicListing(input);
    expect(JSON.stringify(row)).not.toMatch(/D06 [A-Z0-9]{4}|@/);
    expect(Object.keys(row)).not.toContain('eircode');
  });

  it('gives a stable, readable slug', () => {
    expect(listingSlug('2 bed apartment in Ranelagh, Dublin 6', input.listingId)).toBe(
      '2-bed-apartment-in-ranelagh-dublin-6-1a2b3c4d',
    );
  });
});
