import { describe, expect, it } from 'vitest';
import { fixtureGazetteer } from '@/domain/places/fixture';
import {
  alertMatches,
  homeChanges,
  nextDailySend,
  savedSearchName,
  type AlertableListing,
} from './alerts';

const now = new Date('2026-11-07T12:00:00Z');
const home: AlertableListing = {
  rentCents: 185_000,
  bedrooms: 2,
  bathrooms: 1,
  propertyType: 'apartment',
  availableFrom: '2026-12-01',
  furnished: 'furnished',
  petsConsidered: true,
  berBand: 'C',
  facts: { parking: 'street', outdoorSpace: 'balcony', accessibility: [] },
  publishedAt: new Date('2026-11-01T12:00:00Z'),
  county: 'Dublin',
  routingKey: 'D06',
  latitude: 53.3262,
  longitude: -6.2563,
};

const g = fixtureGazetteer();

describe('M86: alerts match exactly what the search would find', () => {
  it('matches by place and filters', () => {
    expect(
      alertMatches(home, { areaPath: '/to-rent/dublin/ranelagh', query: 'beds=2' }, g, now),
    ).toBe(true);
    expect(alertMatches(home, { areaPath: '/to-rent/dublin', query: 'max=1800' }, g, now)).toBe(
      false,
    );
    expect(alertMatches(home, { areaPath: '/to-rent/cork', query: '' }, g, now)).toBe(false);
    expect(
      alertMatches(home, { areaPath: '/to-rent/dublin/dublin-6', query: 'pets=1' }, g, now),
    ).toBe(true);
    expect(alertMatches(home, { areaPath: '/to-rent', query: '' }, g, now)).toBe(true);
  });

  it('treats every home in an alert as new, whatever "newly listed" says', () => {
    expect(alertMatches(home, { areaPath: '/to-rent/dublin', query: 'new=1d' }, g, now)).toBe(true);
  });

  it('matches nothing for a place Gaff no longer knows', () => {
    expect(alertMatches(home, { areaPath: '/to-rent/nowhere', query: '' }, g, now)).toBe(false);
  });
});

describe('M86: saved searches', () => {
  it('get a plain name from their place and filters', () => {
    expect(savedSearchName('/to-rent/dublin/rathmines', 'max=2600&beds=2&pets=1', g)).toBe(
      'Rathmines, 2+ beds, up to €2,600, pets considered',
    );
    expect(savedSearchName('/to-rent', '', g)).toBe('Ireland');
    expect(savedSearchName('/to-rent/cork', 'beds=1', g)).toBe('County Cork, 1+ beds');
  });

  it('send the daily email at 8am in Ireland', () => {
    expect(nextDailySend(new Date('2026-11-07T07:30:00Z')).toISOString()).toBe(
      '2026-11-07T08:00:00.000Z',
    );
    expect(nextDailySend(new Date('2026-11-07T09:00:00Z')).toISOString()).toBe(
      '2026-11-08T08:00:00.000Z',
    );
    // Summer time: 8am in Ireland is 7am UTC.
    expect(nextDailySend(new Date('2026-07-01T06:00:00Z')).toISOString()).toBe(
      '2026-07-01T07:00:00.000Z',
    );
  });
});

describe('M51, M85: what changed about a saved home', () => {
  const saved = { rentCentsWhenSaved: 185_000, statusWhenSaved: 'live' };

  it('shows a lower rent, and enquiries closing', () => {
    expect(homeChanges(saved, { rentCents: 175_000, status: 'enquiries_closed' })).toEqual([
      { kind: 'rent_down', fromCents: 185_000, toCents: 175_000 },
      { kind: 'enquiries_closed' },
    ]);
  });

  it('shows when it’s let, or gone', () => {
    expect(homeChanges(saved, { rentCents: 185_000, status: 'let' })).toEqual([{ kind: 'let' }]);
    expect(homeChanges(saved, null)).toEqual([{ kind: 'gone' }]);
    expect(homeChanges(saved, { rentCents: 185_000, status: 'live' })).toEqual([]);
  });

  it('M113: matches a home near a street, from a "near" search with its distance', () => {
    const nearRathgar = { ...home, latitude: 53.315, longitude: -6.27 };
    const search = { areaPath: '/to-rent/near/highfield-road-rathgar-dublin-6', query: '' };
    expect(alertMatches(nearRathgar, search, g, now)).toBe(true);
    expect(alertMatches({ ...home, latitude: 53.35, longitude: -6.26 }, search, g, now)).toBe(
      false,
    );
    expect(
      alertMatches(
        { ...home, latitude: 53.33, longitude: -6.27 },
        { ...search, query: 'km=2' },
        g,
        now,
      ),
    ).toBe(true);
  });
});
