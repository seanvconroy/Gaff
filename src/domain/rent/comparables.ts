import { z } from 'zod';
import { propertyTypes } from '@/domain/lettings/new-letting';

/**
 * R4: three comparable rents from the RTB Rent Register, kept for the rent-setting pack
 * (R24). Setting rent under the 2026 rules needs three comparables for similar homes in a
 * comparable area. Comparables are property data from the public register; we record the
 * area, not a full address.
 */
export const COMPARABLES_NEEDED = 3;

export interface Comparable {
  area: string;
  propertyType: keyof typeof propertyTypes;
  bedrooms: number;
  monthlyRentCents: number;
  registeredOn?: string;
}

const MIN_RENT = 100_00;
const MAX_RENT = 20_000_00;

export function comparablesFormSchema(today: string) {
  const one = (n: number) =>
    z.object({
      area: z
        .string()
        .trim()
        .min(2, `Comparable ${n}: enter the area shown on the register, like Dublin 6`)
        .max(80, `Comparable ${n}: keep the area under 80 characters`),
      propertyType: z.enum(Object.keys(propertyTypes) as [keyof typeof propertyTypes], {
        error: `Comparable ${n}: choose the type of home`,
      }),
      bedrooms: z.coerce
        .number({ error: `Comparable ${n}: enter the number of bedrooms` })
        .int(`Comparable ${n}: enter a whole number of bedrooms`)
        .min(0, `Comparable ${n}: enter 0 for a studio`)
        .max(10, `Comparable ${n}: enter 10 bedrooms or fewer`),
      rent: z.string().transform((value, ctx) => {
        const cleaned = value.replace(/[€,\s]/g, '');
        const cents = /^\d+(\.\d{1,2})?$/.test(cleaned) ? Math.round(Number(cleaned) * 100) : NaN;
        if (!(cents >= MIN_RENT && cents <= MAX_RENT)) {
          ctx.addIssue({
            code: 'custom',
            message: `Comparable ${n}: enter the monthly rent in euro, like 1,800`,
          });
          return z.NEVER;
        }
        return cents;
      }),
      registeredOn: z
        .string()
        .optional()
        .transform((value) => value || undefined)
        .refine(
          (value) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && value <= today),
          `Comparable ${n}: enter the date on the register. It can’t be in the future.`,
        ),
    });

  // The form sends c1Area, c1PropertyType… for each of the three comparables.
  const three = z.tuple([one(1), one(2), one(3)]);
  type Result =
    | { success: true; data: Comparable[]; error?: undefined }
    | { success: false; error: z.ZodError; data?: undefined };

  function safeParse(values: Record<string, string>): Result {
    const rows = [1, 2, 3].map((n) => ({
      area: values[`c${n}Area`] ?? '',
      propertyType: values[`c${n}PropertyType`] ?? '',
      bedrooms: values[`c${n}Bedrooms`] ?? '',
      rent: values[`c${n}Rent`] ?? '',
      registeredOn: values[`c${n}RegisteredOn`] ?? '',
    }));
    const result = three.safeParse(rows);
    if (!result.success) return { success: false, error: result.error };
    return {
      success: true,
      data: result.data.map((row) => ({
        area: row.area,
        propertyType: row.propertyType,
        bedrooms: row.bedrooms,
        monthlyRentCents: row.rent,
        ...(row.registeredOn ? { registeredOn: row.registeredOn } : {}),
      })),
    };
  }

  return {
    safeParse,
    parse(values: Record<string, string>): Comparable[] {
      const result = safeParse(values);
      if (!result.success) throw result.error;
      return result.data;
    },
  };
}

/** Maps a parse error path ([1, "rent"]) to the form field name ("c2Rent"). */
export function comparableFieldName(path: PropertyKey[]): string {
  const [index, field] = path;
  const suffix = {
    area: 'Area',
    propertyType: 'PropertyType',
    bedrooms: 'Bedrooms',
    rent: 'Rent',
    registeredOn: 'RegisteredOn',
  }[String(field)];
  return typeof index === 'number' && suffix ? `c${index + 1}${suffix}` : 'form';
}

/** Gentle warnings when a comparable isn't much like the home being let. */
export function comparableWarnings(
  home: { propertyType: string; bedrooms: number },
  comparables: Array<{ propertyType: string; bedrooms: number }>,
): string[] {
  return comparables.flatMap((comparable, i) => {
    const warnings: string[] = [];
    if (comparable.propertyType !== home.propertyType) {
      warnings.push(
        `Comparable ${i + 1} is a different type of home (${(propertyTypes[comparable.propertyType as keyof typeof propertyTypes] ?? comparable.propertyType).toLowerCase()}).`,
      );
    }
    if (Math.abs(comparable.bedrooms - home.bedrooms) > 1) {
      warnings.push(
        `Comparable ${i + 1} has ${comparable.bedrooms} bedrooms; this home has ${home.bedrooms}.`,
      );
    }
    return warnings;
  });
}

/** The middle of the three rents, shown beside the asking rent. */
export function medianRentCents(comparables: Array<{ monthlyRentCents: number }>): number {
  const sorted = comparables.map((c) => c.monthlyRentCents).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
