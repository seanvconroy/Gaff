import { describe, expect, it } from 'vitest';
import {
  berRange,
  byDevelopment,
  developmentCounts,
  developmentCountsLine,
  developmentFactsSchema,
  developmentNameSchema,
  groupAlike,
  handChanged,
  mayHaveDevelopments,
  readUnitRows,
  sharedColumns,
  sharedPatch,
  typesOnPage,
  unitTypeRentSchema,
  unitTypeSchema,
  withOwn,
} from './development';

const now = new Date('2026-11-20T10:00:00Z');

const waterside = {
  name: 'The Waterside',
  addressLine1: 'Waterside Road',
  area: 'Sandyford, Dublin 18',
  county: 'Dublin',
  eircode: null,
  point: { lat: 53.27, lng: -6.22 },
  parking: 'space',
  description: 'A new scheme beside the Luas, with a roof terrace and bike storage.',
};
const typeB = {
  propertyType: 'apartment',
  bedrooms: 2,
  bathrooms: 2,
  furnished: 'furnished',
  berRating: 'A2',
  monthlyRentCents: 265_000,
};

describe('M32: a development', () => {
  it('is offered to an agency and a landlord’s team, not to a private landlord’s own homes', () => {
    expect(mayHaveDevelopments('agency')).toBe(true);
    expect(mayHaveDevelopments('landlord')).toBe(true);
    expect(mayHaveDevelopments('private_landlord')).toBe(false);
    expect(mayHaveDevelopments(null)).toBe(false);
  });

  it('has a name, and shared facts that pass the protected-ground check (rule 3)', () => {
    expect(developmentNameSchema().parse({ name: ' The Waterside ' })).toEqual({
      name: 'The Waterside',
    });
    expect(developmentNameSchema().safeParse({ name: 'x' }).success).toBe(false);
    expect(
      developmentFactsSchema().parse({ parking: 'space', description: waterside.description }),
    ).toEqual({ parking: 'space', description: waterside.description });
    const unfair = developmentFactsSchema().safeParse({
      parking: '',
      description: 'Lovely new homes. Ideal for young professionals, no HAP.',
    });
    expect(unfair.success).toBe(false);
  });
});

describe('M33: a unit type', () => {
  it('reads its name, rooms and floor area, with the floor area offered', () => {
    expect(
      unitTypeSchema().parse({
        name: 'Type B',
        propertyType: 'apartment',
        bedrooms: '2',
        bathrooms: '2',
        furnished: 'furnished',
        berRating: 'A2',
        floorAreaSqm: '68',
      }),
    ).toMatchObject({ name: 'Type B', bedrooms: 2, floorAreaSqm: 68 });
    expect(
      unitTypeSchema().parse({ name: 'Type A', propertyType: 'studio', bedrooms: '0' })
        .floorAreaSqm,
    ).toBeUndefined();
  });

  it('reads the rent of each home and how many there are', () => {
    expect(unitTypeRentSchema().parse({ rent: '2,650', count: '4' })).toEqual({
      rentCents: 265_000,
      count: 4,
    });
    expect(unitTypeRentSchema().safeParse({ rent: '2650', count: '0' }).success).toBe(false);
    expect(unitTypeRentSchema().safeParse({ rent: '2650', count: '61' }).success).toBe(false);
  });
});

describe('M35: many homes of a type at once', () => {
  it('reads one row per home: its number, its floor, the date it’s free', () => {
    const { rows, errors } = readUnitRows(
      {
        'unit-0': 'Apartment 12',
        'floor-0': '3',
        'availableFrom-0': '2026-12-01',
        'unit-1': ' Apartment  14 ',
        'floor-1': '',
        'availableFrom-1': '2026-12-15',
      },
      2,
      now,
    );
    expect(errors).toEqual({});
    expect(rows).toEqual([
      { unitLabel: 'Apartment 12', floor: 3, availableFrom: '2026-12-01' },
      { unitLabel: 'Apartment 14', floor: null, availableFrom: '2026-12-15' },
    ]);
  });

  it('says each problem at its own field, and refuses two homes with one number', () => {
    const { errors } = readUnitRows(
      {
        'unit-0': 'Apartment 1',
        'floor-0': 'top',
        'availableFrom-0': '2026-01-01',
        'unit-1': 'apartment 1',
        'availableFrom-1': '2026-12-01',
        'unit-2': '',
      },
      3,
      now,
    );
    expect(Object.keys(errors).sort()).toEqual([
      'availableFrom-0',
      'availableFrom-2',
      'floor-0',
      'unit-1',
      'unit-2',
    ]);
    expect(errors['unit-1']).toBe('Two homes can’t have the same number');
  });
});

describe('BA-15: the shared-value rule', () => {
  const before = sharedColumns(waterside, typeB, 'Apartment 12');

  it('makes a home’s columns from its development, its type and its number', () => {
    expect(before).toMatchObject({
      addressLine1: 'Apartment 12, The Waterside',
      addressLine2: 'Waterside Road',
      area: 'Sandyford, Dublin 18',
      latitude: 53.27,
      parking: 'space',
      bedrooms: 2,
      monthlyRentCents: 265_000,
    });
  });

  it('changes a shared value on a home still using it, never on one changed by hand', () => {
    const after = sharedColumns(
      { ...waterside, parking: 'none', description: 'New words.' },
      { ...typeB, monthlyRentCents: 270_000 },
      'Apartment 12',
    );
    expect(sharedPatch([], before, after)).toEqual({
      parking: 'none',
      description: 'New words.',
      monthlyRentCents: 270_000,
    });
    expect(sharedPatch(['rent', 'description'], before, after)).toEqual({ parking: 'none' });
    expect(sharedPatch([], before, before)).toEqual({});
  });

  it('a renamed development renames its homes, keeping each home’s number', () => {
    const after = sharedColumns({ ...waterside, name: 'Waterside Quarter' }, typeB, 'Apartment 12');
    expect(sharedPatch([], before, after)).toEqual({
      addressLine1: 'Apartment 12, Waterside Quarter',
    });
    expect(sharedPatch(['name'], before, after)).toEqual({});
  });

  it('knows which shared values a lister changed by hand on one home', () => {
    expect(handChanged(before, { ...before, monthlyRentCents: 260_000 })).toEqual(['rent']);
    expect(handChanged(before, { ...before, latitude: 53.28, longitude: -6.21 })).toEqual([
      'point',
    ]);
    expect(handChanged(before, { parking: 'space' })).toEqual([]);
    expect(withOwn(['rent'], ['photos', 'rent'])).toEqual(['photos', 'rent']);
  });
});

describe('M34, M75: the development’s page', () => {
  it('lists each type with homes free, how many, and the lowest rent', () => {
    const types = [
      {
        ref: 'b',
        name: 'Type B',
        propertyType: 'apartment',
        bedrooms: 2,
        bathrooms: 2,
        floorAreaSqm: 68,
        berRating: 'A2',
      },
      {
        ref: 'a',
        name: 'Type A',
        propertyType: 'apartment',
        bedrooms: 1,
        bathrooms: 1,
        floorAreaSqm: 48,
        berRating: 'A2',
      },
      {
        ref: 'c',
        name: 'Type C',
        propertyType: 'apartment',
        bedrooms: 3,
        bathrooms: 2,
        floorAreaSqm: 90,
        berRating: 'A3',
      },
    ];
    const home = (typeRef: string, unitLabel: string, rentCents: number) => ({
      typeRef,
      ref: unitLabel,
      unitLabel,
      floor: 1,
      rentCents,
      availableFrom: '2026-12-01',
    });
    const shown = typesOnPage(types, [
      home('b', 'Apartment 14', 270_000),
      home('b', 'Apartment 12', 265_000),
      home('a', 'Apartment 2', 210_000),
    ]);
    expect(shown.map((t) => [t.name, t.free, t.fromRentCents])).toEqual([
      ['Type A', 1, 210_000],
      ['Type B', 2, 265_000],
    ]);
    expect(shown[1]!.homes.map((h) => h.unitLabel)).toEqual(['Apartment 12', 'Apartment 14']);
  });

  it('says the BER range', () => {
    expect(berRange(['A3', 'A2', null, 'A2'])).toBe('A2 to A3');
    expect(berRange(['B1'])).toBe('B1');
    expect(berRange([null, 'exempt'])).toBeNull();
  });
});

describe('M75: search shows a development’s alike homes as one card per type', () => {
  it('groups homes of one type where its first stood, and leaves the rest alone', () => {
    const homes = [
      { id: '1', alikeKey: null },
      { id: '2', alikeKey: 'b' },
      { id: '3', alikeKey: 'a' },
      { id: '4', alikeKey: 'b' },
      { id: '5', alikeKey: 'b' },
    ];
    const grouped = groupAlike(homes);
    expect(
      grouped.map((g) => (g.kind === 'one' ? g.home.id : `${g.key}:${g.homes.length}`)),
    ).toEqual(['1', 'b:3', '3']);
  });
});

describe('BA-15: Lettings groups a development’s homes under its name', () => {
  it('counts live, let and free', () => {
    const counts = developmentCounts([
      { status: 'live' },
      { status: 'live' },
      { status: 'let' },
      { status: 'draft' },
      { status: 'withdrawn' },
    ]);
    expect(counts).toEqual({ homes: 4, live: 2, let: 1, free: 3 });
    expect(developmentCountsLine(counts)).toBe('4 homes · 2 live · 1 let · 3 free');
  });

  it('puts each development’s homes under it, and the others after', () => {
    const split = byDevelopment(
      [
        { id: '1', developmentId: null },
        { id: '2', developmentId: 'd' },
        { id: '3', developmentId: 'd' },
      ],
      [
        { id: 'd', name: 'The Waterside' },
        { id: 'e', name: 'Empty' },
      ],
    );
    expect(split.developments.map((d) => [d.name, d.lettings.length])).toEqual([
      ['The Waterside', 2],
    ]);
    expect(split.rest.map((l) => l.id)).toEqual(['1']);
  });
});
