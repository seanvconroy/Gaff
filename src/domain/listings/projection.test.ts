import { describe, expect, it } from 'vitest';
import { distanceMetres } from '@/domain/places/geo';
import {
  addressForRenter,
  addressShown,
  buildPublicListing,
  listingSlug,
  listingTitle,
  streetOf,
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
  viewings: [
    { startsAt: '2026-11-01T18:00:00.000Z', endsAt: '2026-11-01T19:00:00.000Z', kind: 'group' },
    { startsAt: '2026-11-20T18:00:00.000Z', endsAt: '2026-11-20T19:00:00.000Z', kind: 'slots' },
    { startsAt: '2026-11-13T18:00:00.000Z', endsAt: '2026-11-13T19:00:00.000Z', kind: 'group' },
  ],
  closedAt: null,
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
    // Every kind of unit is taken off with its number: a studio's too.
    expect(streetOf('Studio 5, 12 Canal View')).toBe('Canal View');
    expect(streetOf('Flat 2, 31 Orchard Row')).toBe('Orchard Row');
    expect(streetOf('19a Millbrook Avenue')).toBe('Millbrook Avenue');
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

  it('M47: shows only the viewing times still to come, soonest first', () => {
    const row = buildPublicListing(input, new Date('2026-11-07T10:00:00Z'));
    expect(row.viewings.map((v) => v.startsAt)).toEqual([
      '2026-11-13T18:00:00.000Z',
      '2026-11-20T18:00:00.000Z',
    ]);
  });

  it('M74: records when a home was let, and only then', () => {
    const closedAt = new Date('2026-11-06T10:00:00Z');
    expect(buildPublicListing({ ...input, status: 'let', closedAt }).closedAt).toEqual(closedAt);
    expect(buildPublicListing({ ...input, status: 'live', closedAt }).closedAt).toBeNull();
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

describe('M38: the exact address reaches a renter only once they’re invited', () => {
  it('shows the street before an invitation, if the letter chose that', () => {
    expect(addressForRenter('9 Eaton Square', false, 'enquired')).toBe('Eaton Square');
    expect(addressForRenter('Apartment 4, 12 Ranelagh Road', false, 'waitlisted')).toBe(
      'Ranelagh Road',
    );
    expect(addressForRenter('9 Eaton Square', false, 'not_invited')).toBe('Eaton Square');
    expect(addressForRenter('9 Eaton Square', false, 'withdrawn')).toBe('Eaton Square');
  });

  it('shows the exact address once invited, or when the letter shows it anyway', () => {
    expect(addressForRenter('9 Eaton Square', false, 'invited')).toBe('9 Eaton Square');
    expect(addressForRenter('9 Eaton Square', false, 'accepted')).toBe('9 Eaton Square');
    expect(addressForRenter('9 Eaton Square', true, 'enquired')).toBe('9 Eaton Square');
  });
});
