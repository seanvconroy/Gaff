import { describe, expect, it } from 'vitest';
import { filterKeys, type SearchFilters } from '@/domain/search/filters';
import { cardLine, chipLabel, fitHeading, freeFrom, missWords, searchCopy } from './search';

const NOW = new Date('2026-11-17T12:00:00Z');

describe('UX-SR-3: the chips say what Gaff understood', () => {
  it('UX-SR-3: as the PRD writes them', () => {
    const filters: SearchFilters = {
      where: 'ranelagh',
      beds: 2,
      maxRent: 2400,
      moveIn: '2027-01-01',
      stay: 'year',
      people: 2,
      pets: false,
      type: 'apartment',
      furnished: true,
      parking: true,
    };
    // The place's name comes from Gaff's place index, looked up on the server.
    expect(filterKeys.map((key) => chipLabel(key, filters, NOW, 'Ranelagh, Dublin 6'))).toEqual([
      'Ranelagh, Dublin 6',
      '2 bedrooms',
      'Up to €2,400 a month',
      'From Friday 1 January 2027',
      'A year',
      '2 people',
      'No pets',
      'Apartment',
      'Furnished',
      'Parking',
    ]);
    expect(chipLabel('beds', { beds: 4 })).toBe('4 or more bedrooms');
    expect(chipLabel('pets', { pets: true })).toBe('With a pet');
  });
});

describe('UX-SR-6: a card says the home in one line', () => {
  it('UX-SR-6: "2-bed apartment · Ranelagh, Dublin 6"', () => {
    const home = {
      bedrooms: 2,
      propertyType: 'apartment',
      area: 'Ranelagh, Dublin 6',
      county: 'Dublin',
    };
    expect(cardLine(home)).toBe('2-bed apartment · Ranelagh, Dublin 6');
    expect(cardLine({ ...home, area: 'Bray', county: 'Wicklow', propertyType: 'house' })).toBe(
      '2-bed house · Bray, Co. Wicklow',
    );
    expect(cardLine({ ...home, bedrooms: 0, propertyType: 'studio' })).toBe(
      'Studio · Ranelagh, Dublin 6',
    );
  });

  it('UX-SR-6: and the date it’s free', () => {
    expect(freeFrom('2026-12-01', '2026-11-17', NOW)).toBe('Free from Tuesday 1 December');
    expect(freeFrom('2026-11-01', '2026-11-17', NOW)).toBe('Free now');
  });
});

describe('UX-SR-7: a close home says what differs, in words', () => {
  it('UX-SR-7: "Up to 2 people. You asked for 3."', () => {
    expect(missWords({ point: 'people', maxOccupants: 2, asked: 3 })).toBe(
      'Up to 2 people. You asked for 3.',
    );
    expect(missWords({ point: 'maxRent', rentCents: 2_600_00, asked: 2400 })).toBe(
      '€2,600 a month. You asked for up to €2,400.',
    );
    expect(missWords({ point: 'beds', bedrooms: 1, asked: 2 })).toBe('1 bedroom. You asked for 2.');
    expect(
      missWords({ point: 'moveIn', availableFrom: '2027-02-01', asked: '2027-01-15' }, NOW),
    ).toBe('Free from Monday 1 February 2027. You asked for Friday 15 January 2027.');
    expect(missWords({ point: 'stay', minStayMonths: 24, asked: 'year' })).toBe(
      '2 years or longer. You asked for a year.',
    );
    expect(missWords({ point: 'pets' })).toBe(
      'No pets (assistance dogs always welcome). You said you have a pet.',
    );
    expect(missWords({ point: 'type', propertyType: 'house', asked: 'apartment' })).toBe(
      'A house. You asked for an apartment.',
    );
    expect(missWords({ point: 'furnished', furnished: 'unfurnished' })).toBe(
      'Unfurnished. You asked for furnished.',
    );
  });

  it('UX-SR-7: headings count homes in words', () => {
    expect(fitHeading(1)).toBe('1 home fits what you asked');
    expect(fitHeading(3)).toBe('3 homes fit what you asked');
  });
});

describe('Voice: search’s words', () => {
  it('rule 3, voice: no exclamation marks and nothing about who a home would suit', () => {
    const words = JSON.stringify(searchCopy);
    expect(words).not.toMatch(/!/);
    expect(words).not.toMatch(/suit/i);
    expect(searchCopy.promise).toBe('Everyone hears back.');
  });
});
