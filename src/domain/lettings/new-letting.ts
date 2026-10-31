import { z } from 'zod';
import { protectedGroundProblem } from '@/domain/compliance/protected-grounds';
import { irishToday } from '@/lib/format';

/** R1: everything an operator enters to create a letting, in under ten minutes. */

export const counties = [
  'Carlow',
  'Cavan',
  'Clare',
  'Cork',
  'Donegal',
  'Dublin',
  'Galway',
  'Kerry',
  'Kildare',
  'Kilkenny',
  'Laois',
  'Leitrim',
  'Limerick',
  'Longford',
  'Louth',
  'Mayo',
  'Meath',
  'Monaghan',
  'Offaly',
  'Roscommon',
  'Sligo',
  'Tipperary',
  'Waterford',
  'Westmeath',
  'Wexford',
  'Wicklow',
] as const;

export const propertyTypes = {
  apartment: 'Apartment',
  house: 'House',
  duplex: 'Duplex',
  studio: 'Studio',
  other: 'Other',
} as const;

export const furnishing = {
  furnished: 'Furnished',
  part_furnished: 'Part furnished',
  unfurnished: 'Unfurnished',
} as const;

export const berRatings = [
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
  'exempt',
] as const;

export const parkingOptions = {
  none: 'No parking',
  street: 'On-street parking',
  space: 'A parking space',
} as const;

const EIRCODE = /^(?:[AC-FHKNPRTV-Y]\d{2}|D6W)[0-9AC-FHKNPRTV-Y]{4}$/;

/** "d06 f2x3" → "D06 F2X3"; null if it isn't a valid Eircode. */
export function normaliseEircode(input: string): string | null {
  const compact = input.replace(/\s+/g, '').toUpperCase();
  return EIRCODE.test(compact) ? `${compact.slice(0, 3)} ${compact.slice(3)}` : null;
}

/** "€1,850", "1850" or "1,850.00" → 185000 cents; null if it isn't an amount. */
export function parseEuroToCents(input: string): number | null {
  const cleaned = input.replace(/[€,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

const MIN_RENT_CENTS = 100_00;
const MAX_RENT_CENTS = 20_000_00;

const trimmed = z.string().trim();
/** Form fields arrive as strings; a missing optional field counts as blank. */
const blankable = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === undefined || value === null ? '' : value), schema);
const optionalText = (max: number, message: string) =>
  blankable(trimmed.max(max, message).transform((value) => value || undefined));

function httpsUrl(message: string, hosts?: string[]) {
  return blankable(trimmed)
    .transform((value) => value || undefined)
    .refine((value) => {
      if (!value) return true;
      try {
        const url = new URL(value);
        if (url.protocol !== 'https:') return false;
        return !hosts || hosts.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
      } catch {
        return false;
      }
    }, message);
}

export function newLettingSchema(now: Date = new Date()) {
  const today = irishToday(now);
  const inAYear = irishToday(new Date(now.getTime() + 366 * 24 * 60 * 60 * 1000));
  return z
    .object({
      addressLine1: trimmed
        .min(3, 'Enter the first line of the address, like 12 Ranelagh Road')
        .max(120, 'Keep the first line under 120 characters'),
      addressLine2: optionalText(120, 'Keep the second line under 120 characters'),
      area: trimmed
        .min(2, 'Enter the area, like Ranelagh, Dublin 6')
        .max(80, 'Keep the area under 80 characters'),
      county: z.enum(counties, { error: 'Choose the county' }),
      eircode: blankable(trimmed).transform((value, ctx) => {
        if (!value) return undefined;
        const eircode = normaliseEircode(value);
        if (!eircode) {
          ctx.addIssue({
            code: 'custom',
            message: 'Enter a valid Eircode, like D06 F2X3, or leave it blank',
          });
          return z.NEVER;
        }
        return eircode;
      }),
      rent: trimmed.transform((value, ctx) => {
        const cents = parseEuroToCents(value);
        if (cents === null) {
          ctx.addIssue({ code: 'custom', message: 'Enter the monthly rent in euro, like 1,850' });
          return z.NEVER;
        }
        if (cents < MIN_RENT_CENTS || cents > MAX_RENT_CENTS) {
          ctx.addIssue({
            code: 'custom',
            message: 'Enter a monthly rent between €100 and €20,000',
          });
          return z.NEVER;
        }
        return cents;
      }),
      availableFrom: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date the home is available from')
        .refine((date) => date >= today, 'The available date can’t be in the past')
        .refine((date) => date <= inAYear, 'Choose a date within the next year'),
      propertyType: z.enum(Object.keys(propertyTypes) as [keyof typeof propertyTypes], {
        error: 'Choose the type of home',
      }),
      bedrooms: z.coerce
        .number({ error: 'Enter the number of bedrooms' })
        .int('Enter a whole number of bedrooms')
        .min(0, 'Enter 0 for a studio')
        .max(10, 'Enter 10 bedrooms or fewer'),
      bathrooms: z.coerce
        .number({ error: 'Enter the number of bathrooms' })
        .int('Enter a whole number of bathrooms')
        .min(1, 'Enter at least 1 bathroom')
        .max(10, 'Enter 10 bathrooms or fewer'),
      furnished: z.enum(Object.keys(furnishing) as [keyof typeof furnishing], {
        error: 'Choose whether the home is furnished',
      }),
      berRating: z.enum(berRatings, { error: 'Choose the BER rating' }),
      parking: blankable(
        z.union([
          z.enum(Object.keys(parkingOptions) as [keyof typeof parkingOptions]),
          z.literal('').transform(() => undefined),
        ]),
      ),
      photosUrl: httpsUrl('Enter a web link to the photos, starting https://'),
      daftUrl: httpsUrl('Enter the link to the advert on daft.ie', ['daft.ie']),
      myhomeUrl: httpsUrl('Enter the link to the advert on myhome.ie', ['myhome.ie']),
      landlordName: optionalText(120, 'Keep the landlord’s name under 120 characters'),
      landlordEmail: blankable(trimmed)
        .transform((value) => value.toLowerCase() || undefined)
        .refine(
          (value) => !value || z.email().safeParse(value).success,
          'Enter the landlord’s email address, like owner@example.ie',
        ),
      otherFacts: z
        .string()
        .default('')
        .transform((value, ctx) => {
          const lines = value
            .split('\n')
            .map((line) => line.trim().replace(/^[-•*]\s*/, ''))
            .filter(Boolean);
          if (lines.length > 20) {
            ctx.addIssue({
              code: 'custom',
              message: 'Add up to 20 facts. You can add more later.',
            });
            return z.NEVER;
          }
          for (const line of lines) {
            if (line.length > 300) {
              ctx.addIssue({ code: 'custom', message: 'Keep each fact under 300 characters' });
              return z.NEVER;
            }
            const problem = protectedGroundProblem(line);
            if (problem) {
              ctx.addIssue({ code: 'custom', message: problem });
              return z.NEVER;
            }
          }
          return lines;
        }),
    })
    .superRefine((value, ctx) => {
      if (value.landlordEmail && !value.landlordName) {
        ctx.addIssue({
          code: 'custom',
          path: ['landlordName'],
          message: 'Enter the landlord’s name',
        });
      }
      if (value.landlordName && !value.landlordEmail) {
        ctx.addIssue({
          code: 'custom',
          path: ['landlordEmail'],
          message: 'Enter the landlord’s email address, so they can follow the letting',
        });
      }
    });
}

export type NewLetting = z.output<ReturnType<typeof newLettingSchema>>;

/** The key facts as label and answer pairs: what the AI may answer from (R8). */
export function describeKeyFacts(letting: {
  propertyType: keyof typeof propertyTypes;
  bedrooms: number;
  bathrooms: number;
  furnished: keyof typeof furnishing;
  berRating: (typeof berRatings)[number];
  parking?: keyof typeof parkingOptions | null;
}): Array<{ label: string; value: string }> {
  const facts = [
    { label: 'Type of home', value: propertyTypes[letting.propertyType] },
    {
      label: 'Bedrooms',
      value: letting.bedrooms === 0 ? 'Studio (no separate bedroom)' : String(letting.bedrooms),
    },
    { label: 'Bathrooms', value: String(letting.bathrooms) },
    { label: 'Furnishing', value: furnishing[letting.furnished] },
    { label: 'BER rating', value: letting.berRating === 'exempt' ? 'Exempt' : letting.berRating },
  ];
  if (letting.parking) facts.push({ label: 'Parking', value: parkingOptions[letting.parking] });
  return facts;
}
