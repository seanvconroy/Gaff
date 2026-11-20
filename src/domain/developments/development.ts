import { z } from 'zod';
import { lettingFields } from '@/domain/lettings/new-letting';
import type { OrganisationKind } from '@/domain/organisations/kinds';

/**
 * BA-15 (the live line's M32 to M35, M75): a development, and letting many alike homes.
 *
 * A development is a scheme of homes under one name: its address, its place and pin, shared
 * photos and shared facts. Within it, a unit type is a kind of home ("2-bed apartment, type B")
 * with its rooms, floor area, rent, its own photos and floor plan, and how many there are. Each
 * home of a type is an ordinary letting (the letting is the unit, as everywhere in the
 * redesign): its own people, viewings, decisions and tenancy. Only how it was made, and the
 * values it shares, are new.
 *
 * Nothing here is about a person: a development and its types are facts about homes.
 */

/**
 * A development belongs to an agency or a landlord's team. A private landlord's own homes are
 * added one at a time: "Several alike in one development" isn't offered to them.
 */
export function mayHaveDevelopments(kind: OrganisationKind | null): boolean {
  return kind === 'agency' || kind === 'landlord';
}

const trimmed = z.string().trim();

/** "What is the development called?" */
export function developmentNameSchema() {
  return z.object({
    name: trimmed
      .min(2, 'Enter the development’s name, like The Waterside')
      .max(80, 'Keep the name under 80 characters'),
  });
}

/** "What do the homes share?": parking and the development in the lister's own words. */
export function developmentFactsSchema() {
  const fields = lettingFields();
  return z.object({ parking: fields.parking, description: fields.description });
}

/** The most homes of one type made in one step. */
export const MAX_HOMES_PER_TYPE = 60;

/** "What kind of home is this?": a type's name and its rooms, as a home's facts are asked. */
export function unitTypeSchema() {
  const fields = lettingFields();
  return z.object({
    name: trimmed
      .min(1, 'Give this type a name, like Type B')
      .max(60, 'Keep the name under 60 characters'),
    propertyType: fields.propertyType,
    bedrooms: fields.bedrooms,
    bathrooms: fields.bathrooms,
    furnished: fields.furnished,
    berRating: fields.berRating,
    floorAreaSqm: z.preprocess(
      (value) => (value === '' || value === undefined || value === null ? undefined : value),
      z.coerce
        .number({ error: 'Enter the floor area in square metres, like 68' })
        .int('Enter a whole number of square metres')
        .min(10, 'Enter the floor area in square metres, like 68')
        .max(1000, 'Enter the floor area in square metres, like 68')
        .optional(),
    ),
  });
}
export type UnitTypeInput = z.output<ReturnType<typeof unitTypeSchema>>;

/** "Rent, and how many": the rent of each home of the type, and how many there are. */
export function unitTypeRentSchema() {
  const fields = lettingFields();
  return z
    .object({
      rent: fields.rent,
      count: z.coerce
        .number({ error: 'Enter how many homes of this type there are' })
        .int('Enter a whole number of homes')
        .min(1, 'Enter at least 1 home')
        .max(MAX_HOMES_PER_TYPE, `Add up to ${MAX_HOMES_PER_TYPE} homes of a type at a time`),
    })
    .transform(({ rent, count }) => ({ rentCents: rent, count }));
}

/** One home of a type, as the lister gives it: its number or door, its floor, when it's free. */
export interface UnitRow {
  unitLabel: string;
  floor: number | null;
  availableFrom: string;
}

/**
 * M35, "Which homes are they?": one row per home of the type, read from the form's fields
 * `unit-0`, `floor-0`, `availableFrom-0` and so on. Each problem is at its own field. Two homes
 * of a development can't have the same number.
 */
export function readUnitRows(
  values: Readonly<Record<string, string | undefined>>,
  count: number,
  now: Date = new Date(),
): { rows: UnitRow[]; errors: Record<string, string> } {
  const { availableFrom } = lettingFields(now);
  const rows: UnitRow[] = [];
  const errors: Record<string, string> = {};
  const seen = new Set<string>();
  for (let i = 0; i < count; i += 1) {
    const unitLabel = (values[`unit-${i}`] ?? '').trim().replace(/\s+/g, ' ');
    const floorText = (values[`floor-${i}`] ?? '').trim();
    const date = availableFrom.safeParse(values[`availableFrom-${i}`] ?? '');
    if (unitLabel.length < 1 || unitLabel.length > 40) {
      errors[`unit-${i}`] = 'Give the home its number or door, like Apartment 12';
    } else if (seen.has(unitLabel.toLowerCase())) {
      errors[`unit-${i}`] = 'Two homes can’t have the same number';
    }
    seen.add(unitLabel.toLowerCase());
    if (floorText && !/^-?\d{1,2}$/.test(floorText)) {
      errors[`floor-${i}`] = 'Enter the floor as a number, like 3, or 0 for the ground floor';
    }
    if (!date.success) {
      errors[`availableFrom-${i}`] =
        date.error.issues[0]?.message ?? 'Choose the date it’s free from';
    }
    rows.push({
      unitLabel,
      floor: floorText && /^-?\d{1,2}$/.test(floorText) ? Number(floorText) : null,
      availableFrom: date.success ? date.data : '',
    });
  }
  return { rows, errors };
}

/** A home of a development is known by its number and the development: "Apartment 12, The Waterside". */
export function unitAddress(unitLabel: string, developmentName: string): string {
  return `${unitLabel}, ${developmentName}`;
}

// ---------------------------------------------------------------------------------------------
// The shared-value rule.

/**
 * The values a development's homes take from it, or from their type, until a lister changes
 * them by hand on one home. Changing one of these on the development or the type changes it on
 * every home still using the shared value, and never on one changed by hand.
 */
export const sharedFields = [
  // From the development.
  'name',
  'street',
  'area',
  'county',
  'eircode',
  'point',
  'parking',
  'description',
  'photos',
  // From the type.
  'propertyType',
  'bedrooms',
  'bathrooms',
  'furnished',
  'berRating',
  'rent',
] as const;
export type SharedField = (typeof sharedFields)[number];

/** What a development shares with its homes. */
export interface DevelopmentShared {
  name: string;
  addressLine1: string;
  area: string;
  county: string;
  eircode: string | null;
  point: { lat: number; lng: number } | null;
  parking: string | null;
  description: string | null;
}

/** What a type shares with its homes. */
export interface UnitTypeShared {
  propertyType: string;
  bedrooms: number;
  bathrooms: number | null;
  furnished: string | null;
  berRating: string | null;
  monthlyRentCents: number;
}

/** A letting's columns that come from shared values (and the home's own number). */
export interface SharedColumns {
  addressLine1: string;
  addressLine2: string | null;
  area: string;
  county: string;
  eircode: string | null;
  latitude: number | null;
  longitude: number | null;
  parking: string | null;
  description: string | null;
  propertyType: string;
  bedrooms: number;
  bathrooms: number | null;
  furnished: string | null;
  berRating: string | null;
  monthlyRentCents: number;
}

const columnsOf: Record<Exclude<SharedField, 'photos'>, readonly (keyof SharedColumns)[]> = {
  name: ['addressLine1'],
  street: ['addressLine2'],
  area: ['area'],
  county: ['county'],
  eircode: ['eircode'],
  point: ['latitude', 'longitude'],
  parking: ['parking'],
  description: ['description'],
  propertyType: ['propertyType'],
  bedrooms: ['bedrooms'],
  bathrooms: ['bathrooms'],
  furnished: ['furnished'],
  berRating: ['berRating'],
  rent: ['monthlyRentCents'],
};

/** A home's shared columns, as its development and type say them. */
export function sharedColumns(
  development: DevelopmentShared,
  type: UnitTypeShared,
  unitLabel: string,
): SharedColumns {
  return {
    addressLine1: unitAddress(unitLabel, development.name),
    addressLine2: development.addressLine1,
    area: development.area,
    county: development.county,
    eircode: development.eircode,
    latitude: development.point?.lat ?? null,
    longitude: development.point?.lng ?? null,
    parking: development.parking,
    description: development.description,
    propertyType: type.propertyType,
    bedrooms: type.bedrooms,
    bathrooms: type.bathrooms,
    furnished: type.furnished,
    berRating: type.berRating,
    monthlyRentCents: type.monthlyRentCents,
  };
}

/**
 * What a change to the development or the type writes on one of its homes: the columns of the
 * shared values that changed, leaving out every value the lister changed by hand on that home.
 */
export function sharedPatch(
  own: readonly string[],
  before: SharedColumns,
  after: SharedColumns,
): Partial<SharedColumns> {
  const patch: Partial<SharedColumns> = {};
  for (const [field, columns] of Object.entries(columnsOf) as Array<
    [SharedField, readonly (keyof SharedColumns)[]]
  >) {
    if (own.includes(field)) continue;
    for (const column of columns) {
      if (before[column] !== after[column]) {
        (patch as Record<string, unknown>)[column] = after[column];
      }
    }
  }
  return patch;
}

/**
 * The shared values a lister changed by hand on one home, from its columns before and after.
 * From then on they're that home's own.
 */
export function handChanged(
  before: Partial<SharedColumns>,
  after: Partial<SharedColumns>,
): SharedField[] {
  return (Object.entries(columnsOf) as Array<[SharedField, readonly (keyof SharedColumns)[]]>)
    .filter(([, columns]) =>
      columns.some(
        (column) => column in after && (after[column] ?? null) !== (before[column] ?? null),
      ),
    )
    .map(([field]) => field);
}

/** A home's own values, with more added: each once, in the fixed order. */
export function withOwn(own: readonly string[], more: readonly SharedField[]): SharedField[] {
  return sharedFields.filter((field) => own.includes(field) || more.includes(field));
}

// ---------------------------------------------------------------------------------------------
// The public side (M34, M75).

/** M75: a development's public page, and a type on it. */
export const developmentHref = (ref: string, typeRef?: string) =>
  `/developments/${ref}${typeRef ? `#type-${typeRef}` : ''}`;

/** A free home of a development, as its page lists it under its type. */
export interface FreeHome {
  ref: string;
  unitLabel: string;
  floor: number | null;
  rentCents: number;
  availableFrom: string;
}

/** A type as the development's page shows it: "2-bed apartment, type B · 4 free · from €2,650". */
export interface TypeOnPage<H extends FreeHome = FreeHome> {
  ref: string;
  name: string;
  propertyType: string;
  bedrooms: number;
  bathrooms: number | null;
  floorAreaSqm: number | null;
  berRating: string | null;
  free: number;
  fromRentCents: number;
  homes: H[];
}

/**
 * M34: the development's types with homes free now, each with how many and the lowest rent, its
 * homes cheapest first. A type with no free home isn't listed. Fewest bedrooms first.
 */
export function typesOnPage<H extends FreeHome>(
  types: ReadonlyArray<Omit<TypeOnPage<H>, 'free' | 'fromRentCents' | 'homes'>>,
  homes: ReadonlyArray<H & { typeRef: string }>,
): TypeOnPage<H>[] {
  return types
    .map((type) => {
      const mine = homes
        .filter((home) => home.typeRef === type.ref)
        .sort(
          (a, b) =>
            a.rentCents - b.rentCents ||
            a.availableFrom.localeCompare(b.availableFrom) ||
            a.unitLabel.localeCompare(b.unitLabel, 'en-IE', { numeric: true }),
        );
      return {
        ...type,
        free: mine.length,
        fromRentCents: mine.length > 0 ? Math.min(...mine.map((home) => home.rentCents)) : 0,
        homes: mine,
      };
    })
    .filter((type) => type.free > 0)
    .sort((a, b) => a.bedrooms - b.bedrooms || a.name.localeCompare(b.name, 'en-IE'));
}

/** The BER range across the free homes: "A2" or "A2 to A3". Null: no BER given. */
export function berRange(ratings: ReadonlyArray<string | null>): string | null {
  const order = [
    'A1',
    'A2',
    'A3',
    'B1',
    'B2',
    'B3',
    'C1',
    'C2',
    'C3',
    'D1',
    'D2',
    'E1',
    'E2',
    'F',
    'G',
  ];
  const known = [
    ...new Set(ratings.filter((r): r is string => r !== null && order.includes(r))),
  ].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (known.length === 0) return null;
  return known.length === 1 ? known[0]! : `${known[0]} to ${known[known.length - 1]}`;
}

/**
 * Search: a development's alike homes are one card per type ("4 homes like this"), so a scheme
 * doesn't fill the results. This is its own step, after search has found and ordered its
 * homes: the matcher never sees it. A home outside a development, or alone of its type in
 * these results, stays a card of its own. A group stands where its first home stood.
 */
export type Alike<H> = { kind: 'one'; home: H } | { kind: 'alike'; key: string; homes: H[] };

export function groupAlike<H extends { alikeKey: string | null }>(homes: readonly H[]): Alike<H>[] {
  const groups = new Map<string, H[]>();
  for (const home of homes) {
    if (!home.alikeKey) continue;
    groups.set(home.alikeKey, [...(groups.get(home.alikeKey) ?? []), home]);
  }
  const placed = new Set<string>();
  const out: Alike<H>[] = [];
  for (const home of homes) {
    const group = home.alikeKey ? groups.get(home.alikeKey)! : null;
    if (!group || group.length < 2) {
      out.push({ kind: 'one', home });
    } else if (!placed.has(home.alikeKey!)) {
      placed.add(home.alikeKey!);
      out.push({ kind: 'alike', key: home.alikeKey!, homes: group });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The letting side.

/** "6 homes · 4 live · 1 let · 5 free": a development's homes on Lettings. */
export interface DevelopmentCounts {
  homes: number;
  live: number;
  let: number;
  /** Not let yet: live or still setting up. */
  free: number;
}

export function developmentCounts(lettings: ReadonlyArray<{ status: string }>): DevelopmentCounts {
  const open = lettings.filter((l) => l.status !== 'withdrawn');
  return {
    homes: open.length,
    live: open.filter((l) => l.status === 'live').length,
    let: open.filter((l) => l.status === 'let').length,
    free: open.filter((l) => l.status === 'live' || l.status === 'draft').length,
  };
}

export function developmentCountsLine(counts: DevelopmentCounts): string {
  const homes = `${counts.homes} ${counts.homes === 1 ? 'home' : 'homes'}`;
  return [homes, `${counts.live} live`, `${counts.let} let`, `${counts.free} free`].join(' · ');
}

/**
 * Lettings: a development's homes under its name, in the order the developments were made; the
 * other homes after, as before.
 */
export function byDevelopment<T extends { developmentId: string | null }>(
  lettings: readonly T[],
  developments: ReadonlyArray<{ id: string; name: string }>,
): { developments: Array<{ id: string; name: string; lettings: T[] }>; rest: T[] } {
  const known = new Set(developments.map((d) => d.id));
  return {
    developments: developments
      .map((d) => ({ ...d, lettings: lettings.filter((l) => l.developmentId === d.id) }))
      .filter((d) => d.lettings.length > 0),
    rest: lettings.filter((l) => !l.developmentId || !known.has(l.developmentId)),
  };
}
