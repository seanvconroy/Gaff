import { describe, expect, it } from 'vitest';
import {
  developmentPublishProblems,
  developmentSchema,
  homesByType,
  parseUnitRows,
} from './development';

describe('M32: a development', () => {
  it('reads the form, with amenities only from the fixed list', () => {
    expect(
      developmentSchema.parse({
        name: ' The Waterside ',
        addressLine1: 'Waterside Road',
        area: 'Sandyford, Dublin 18',
        county: 'Dublin',
        eircode: 'd18 a2c3',
        description: '',
        amenities: 'gym,concierge,swimming_pool',
      }),
    ).toMatchObject({
      name: 'The Waterside',
      eircode: 'D18 A2C3',
      amenities: ['gym', 'concierge'],
    });
  });

  it('M46: can’t go live with protected-ground wording, too few photos, or unchecked', () => {
    const fine = 'A new build-to-rent development beside the Luas, with a gym and a roof terrace.';
    expect(
      developmentPublishProblems({ description: fine, readyPhotos: 3, lettersChecked: true }),
    ).toEqual([]);
    const problems = developmentPublishProblems({
      description: `${fine} Ideal for young professionals, no HAP.`,
      readyPhotos: 1,
      lettersChecked: false,
    });
    expect(problems.map((p) => p.field)).toEqual([
      'checks',
      'description',
      'description',
      'photos',
    ]);
  });
});

describe('M34: homes by type', () => {
  it('groups homes with the number available and the lowest rent', () => {
    const groups = homesByType([
      { propertyType: 'apartment', bedrooms: 2, rentCents: 280_000 },
      { propertyType: 'apartment', bedrooms: 1, rentCents: 220_000 },
      { propertyType: 'apartment', bedrooms: 2, rentCents: 265_000 },
    ]);
    expect(groups.map((g) => [g.bedrooms, g.available, g.fromRentCents])).toEqual([
      [1, 1, 220_000],
      [2, 2, 265_000],
    ]);
  });
});

describe('M35: many homes at once, from a spreadsheet', () => {
  const today = '2026-11-07';

  it('reads one home per line, commas or tabs, skipping a header', () => {
    const { rows, errors } = parseUnitRows(
      'Unit, Floor, Rent, Available from, Size\nApartment 12, 3, 2650, 2026-12-01, 68\nApartment 14\t4\t€2,700\t2026-12-15\t',
      today,
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        unit: 'Apartment 12',
        floor: 3,
        rentCents: 265_000,
        availableFrom: '2026-12-01',
        floorAreaSqm: 68,
      },
      {
        unit: 'Apartment 14',
        floor: 4,
        rentCents: 270_000,
        availableFrom: '2026-12-15',
        floorAreaSqm: null,
      },
    ]);
  });

  it('names the line that’s wrong', () => {
    const { errors } = parseUnitRows(
      'Apartment 1, 2, lots, 2026-12-01\nApartment 2, 2, 2500, 2026-01-01',
      today,
    );
    expect(errors).toEqual([
      'Line 1: enter the rent a month in euro, like 2650',
      `Line 2: enter the date it’s available from, like ${today}`,
    ]);
    expect(parseUnitRows('', today).errors).toEqual(['Add at least one home, one per line.']);
  });
});
