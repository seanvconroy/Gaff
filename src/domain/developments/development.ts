import { z } from 'zod';
import { counties } from '@/domain/lettings/new-letting';
import { normaliseEircode } from '@/domain/places/eircode';
import { blockingFindings, checkListingText } from '@/domain/moderation/listing-text';
import { MIN_PHOTOS_TO_PUBLISH } from '@/domain/media/photos';

/**
 * M32 to M35, M75: a development groups homes under one name and operator, with its own
 * location, description, amenities and photos. Homes in it add their own floor, size, rent,
 * availability and photos.
 */

/** M32: amenities from a fixed list, so renters can compare developments. */
export const amenities = {
  concierge: 'Concierge',
  gym: 'Gym',
  residents_lounge: 'Residents’ lounge',
  co_working: 'Co-working space',
  roof_terrace: 'Roof terrace',
  communal_garden: 'Communal garden',
  playground: 'Playground',
  bike_storage: 'Bike storage',
  car_parking: 'Car parking',
  ev_charging: 'EV charging',
  parcel_lockers: 'Parcel lockers',
  lift: 'Lift',
} as const;
export type Amenity = keyof typeof amenities;

const trimmed = z.string().trim();

export const developmentSchema = z.object({
  name: trimmed.min(2, 'Enter the development’s name').max(80, 'Keep the name under 80 characters'),
  addressLine1: trimmed
    .min(3, 'Enter the development’s street address')
    .max(120, 'Keep the address under 120 characters'),
  area: trimmed.min(2, 'Enter the area, like Sandyford, Dublin 18').max(80),
  county: z.enum(counties, { message: 'Choose the county' }),
  eircode: trimmed.transform((value, ctx) => {
    if (!value) return null;
    const normalised = normaliseEircode(value);
    if (!normalised) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid Eircode, or leave it blank' });
      return z.NEVER;
    }
    return normalised;
  }),
  description: trimmed.max(4000, 'Keep the description under 4,000 characters'),
  amenities: z.string().transform((value) =>
    value
      .split(',')
      .map((a) => a.trim())
      .filter((a): a is Amenity => a in amenities),
  ),
});
export type DevelopmentInput = z.output<typeof developmentSchema>;

/** M32, M46: what stops a development page going live, in the letter's words. */
export function developmentPublishProblems(input: {
  description: string;
  readyPhotos: number;
  lettersChecked: boolean;
}): Array<{ field: string; message: string }> {
  const problems: Array<{ field: string; message: string }> = [];
  if (!input.lettersChecked) {
    problems.push({ field: 'checks', message: 'Finish Gaff’s checks on your account first.' });
  }
  if (input.description.trim().length < 50) {
    problems.push({
      field: 'description',
      message: 'Describe the development in a few sentences: renters see it on its page.',
    });
  }
  for (const finding of blockingFindings(checkListingText(input.description))) {
    problems.push({ field: 'description', message: finding.message });
  }
  if (input.readyPhotos < MIN_PHOTOS_TO_PUBLISH) {
    problems.push({
      field: 'photos',
      message: `Add at least ${MIN_PHOTOS_TO_PUBLISH} photos of the development.`,
    });
  }
  return problems;
}

/** M34: "2 bed apartment · 4 available · from €2,650 a month", one line per type. */
export function homesByType<
  T extends { propertyType: string; bedrooms: number; rentCents: number },
>(homes: readonly T[]) {
  const groups = new Map<string, { propertyType: string; bedrooms: number; homes: T[] }>();
  for (const home of homes) {
    const key = `${home.bedrooms}:${home.propertyType}`;
    const group = groups.get(key) ?? {
      propertyType: home.propertyType,
      bedrooms: home.bedrooms,
      homes: [],
    };
    group.homes.push(home);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      available: g.homes.length,
      fromRentCents: Math.min(...g.homes.map((h) => h.rentCents)),
      homes: [...g.homes].sort((a, b) => a.rentCents - b.rentCents),
    }))
    .sort((a, b) => a.bedrooms - b.bedrooms || a.propertyType.localeCompare(b.propertyType));
}

export interface UnitRow {
  unit: string;
  floor: number | null;
  rentCents: number;
  availableFrom: string;
  floorAreaSqm: number | null;
}

/**
 * M35: many homes at once, pasted from a spreadsheet: one per line, "unit, floor, rent,
 * available from, size". Commas or tabs; a header row is skipped. Errors name the line.
 */
export function parseUnitRows(text: string, today: string): { rows: UnitRow[]; errors: string[] } {
  const rows: UnitRow[] = [];
  const errors: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  lines.forEach((line, index) => {
    // Tabs when pasted from a spreadsheet (so "€2,700" stays whole); otherwise commas, with
    // quotes around any cell that has a comma in it.
    const cells = (
      line.includes('\t') ? line.split('\t') : line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    ).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (index === 0 && /unit/i.test(cells[0] ?? '') && /rent/i.test(line)) return;
    const n = index + 1;
    const [unit = '', floor = '', rent = '', available = '', size = ''] = cells;
    const rentCents = Math.round(
      Number(rent.replace(/[€\s]/g, '').replace(/,(?=\d{3}\b)/g, '')) * 100,
    );
    if (unit.length < 1 || unit.length > 60)
      errors.push(`Line ${n}: give the unit a name, like Apartment 12`);
    else if (!/^-?\d{0,2}$/.test(floor))
      errors.push(`Line ${n}: the floor should be a number, like 3`);
    else if (!Number.isFinite(rentCents) || rentCents < 10_000 || rentCents > 2_000_000)
      errors.push(`Line ${n}: enter the rent a month in euro, like 2650`);
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(available) || available < today)
      errors.push(`Line ${n}: enter the date it’s available from, like ${today}`);
    else if (size && !/^\d{2,4}$/.test(size))
      errors.push(`Line ${n}: the size is in square metres, like 68`);
    else
      rows.push({
        unit,
        floor: floor === '' ? null : Number(floor),
        rentCents,
        availableFrom: available,
        floorAreaSqm: size ? Number(size) : null,
      });
  });
  if (lines.length === 0) errors.push('Add at least one home, one per line.');
  if (rows.length > 100) errors.push('Add up to 100 homes at a time.');
  return { rows, errors };
}
