import { describe, expect, it } from 'vitest';
import {
  describeKeyFacts,
  newLettingSchema,
  normaliseEircode,
  parseEuroToCents,
} from './new-letting';

const now = new Date('2026-10-31T12:00:00Z');
const schema = newLettingSchema(now);

const valid = {
  addressLine1: '12 Ranelagh Road',
  addressLine2: '',
  area: 'Ranelagh, Dublin 6',
  county: 'Dublin',
  eircode: 'd06 f2x3',
  rent: '€1,850',
  availableFrom: '2026-12-01',
  propertyType: 'apartment',
  bedrooms: '2',
  bathrooms: '1',
  furnished: 'furnished',
  berRating: 'C1',
  parking: '',
  photosUrl: 'https://photos.example.ie/12-ranelagh',
  daftUrl: 'https://www.daft.ie/for-rent/apartment-12-ranelagh-road/123456',
  myhomeUrl: '',
  landlordName: '',
  landlordEmail: '',
  otherFacts: '- Gas central heating\n\n• Bins collected on Tuesdays\n',
};

describe('R1: create a letting', () => {
  it('accepts a complete letting and tidies it up', () => {
    const letting = schema.parse(valid);
    expect(letting).toMatchObject({
      addressLine1: '12 Ranelagh Road',
      addressLine2: undefined,
      eircode: 'D06 F2X3',
      rent: 185_000,
      bedrooms: 2,
      parking: undefined,
      myhomeUrl: undefined,
      otherFacts: ['Gas central heating', 'Bins collected on Tuesdays'],
    });
  });

  it('needs only the essentials (it should take under ten minutes)', () => {
    const minimal = schema.parse({
      addressLine1: '4 Main Street',
      area: 'Navan',
      county: 'Meath',
      eircode: '',
      rent: '1400',
      availableFrom: '2026-11-15',
      propertyType: 'house',
      bedrooms: '3',
      bathrooms: '2',
      furnished: 'unfurnished',
      berRating: 'B3',
      photosUrl: '',
      daftUrl: '',
      myhomeUrl: '',
      landlordName: '',
      landlordEmail: '',
    });
    expect(minimal.otherFacts).toEqual([]);
  });

  it.each([
    ['addressLine1', '', 'Enter the first line of the address'],
    ['county', 'Antrim', 'Choose the county'],
    ['eircode', 'D06', 'Enter a valid Eircode'],
    ['rent', 'about 1800', 'Enter the monthly rent in euro'],
    ['rent', '50', 'between €100 and €20,000'],
    ['availableFrom', '2026-10-30', 'can’t be in the past'],
    ['availableFrom', '2028-01-01', 'within the next year'],
    ['bedrooms', '-1', 'Enter 0 for a studio'],
    ['berRating', 'Z9', 'Choose the BER rating'],
    ['photosUrl', 'http://photos.example.ie', 'starting https://'],
    ['daftUrl', 'https://www.example.com/ad/1', 'daft.ie'],
    ['myhomeUrl', 'https://www.daft.ie/ad/1', 'myhome.ie'],
  ])('explains a problem with %s in plain words', (field, value, message) => {
    const result = schema.safeParse({ ...valid, [field]: value });
    expect(result.success).toBe(false);
    const issue = result.error?.issues.find((i) => i.path[0] === field);
    expect(issue?.message).toContain(message);
  });

  it('needs both the landlord’s name and email, or neither', () => {
    const result = schema.safeParse({ ...valid, landlordName: 'Mary Byrne' });
    expect(result.error?.issues[0]).toMatchObject({ path: ['landlordEmail'] });
    expect(
      schema.parse({ ...valid, landlordName: 'Mary Byrne', landlordEmail: 'Mary@Example.ie' })
        .landlordEmail,
    ).toBe('mary@example.ie');
  });

  it('Q7: refuses a key fact that touches a protected ground', () => {
    const result = schema.safeParse({ ...valid, otherFacts: 'Gas heating\nNo HAP' });
    expect(result.error?.issues[0]?.message).toContain('housing assistance');
  });

  it('turns the key facts into plain answers the AI can use (R8)', () => {
    expect(
      describeKeyFacts({
        propertyType: 'studio',
        bedrooms: 0,
        bathrooms: 1,
        furnished: 'part_furnished',
        berRating: 'exempt',
        parking: 'street',
      }),
    ).toEqual([
      { label: 'Type of home', value: 'Studio' },
      { label: 'Bedrooms', value: 'Studio (no separate bedroom)' },
      { label: 'Bathrooms', value: '1' },
      { label: 'Furnishing', value: 'Part furnished' },
      { label: 'BER rating', value: 'Exempt' },
      { label: 'Parking', value: 'On-street parking' },
    ]);
  });
});

describe('Eircodes and euro amounts', () => {
  it.each([
    ['d06f2x3', 'D06 F2X3'],
    ['D6W 1234', 'D6W 1234'],
    ['A65 F4E2', 'A65 F4E2'],
    ['B12 3456', null],
    ['D06 F2X', null],
  ])('%s → %s', (input, expected) => {
    expect(normaliseEircode(input)).toBe(expected);
  });

  it.each([
    ['1850', 185_000],
    ['€1,850', 185_000],
    ['1,850.50', 185_050],
    ['€ 2 000', 200_000],
    ['1850.505', null],
    ['eighteen hundred', null],
  ])('%s → %s cents', (input, expected) => {
    expect(parseEuroToCents(input)).toBe(expected);
  });
});
