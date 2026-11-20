import { z } from 'zod';
import { homeWordingProblem } from '@/domain/compliance/who-should-apply';
import { irishToday } from '@/lib/format';
import {
  appliances,
  broadbandTypes,
  heatingTypes,
  HIGHEST_FLOOR,
  isTourUrl,
  LOWEST_FLOOR,
  MAX_FLOOR_AREA,
  MIN_FLOOR_AREA,
  type MoreFacts,
  moreFactLines,
  normaliseBerNumber,
  outdoorSpaces,
} from './more-facts';

/**
 * R1: everything that can be said about a home when a letting is made. The screens ask for it a
 * step at a time (add-letting.ts); this file holds each field's rule, once.
 */

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

export const MIN_RENT_CENTS = 100_00;
export const MAX_RENT_CENTS = 20_000_00;
/** A description is a few paragraphs, as on an advert. */
export const MAX_DESCRIPTION = 4000;

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

/** A choice that may be left blank: blank means "not said", never a guess. */
function offered<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) => (value === '' || value === undefined || value === null ? undefined : value),
    schema.optional(),
  );
}

/** A home is available from today, up to a year ahead: the dates the picker offers. */
export function availableWindow(now: Date = new Date()): { today: string; inAYear: string } {
  return {
    today: irishToday(now),
    inAYear: irishToday(new Date(now.getTime() + 366 * 24 * 60 * 60 * 1000)),
  };
}

/**
 * Each field's rule, once. The step-at-a-time flow (add-letting.ts) and the whole-letting schema
 * below read the same ones, so a value is checked the same way wherever it is typed.
 */
export function lettingFields(now: Date = new Date()) {
  const { today, inAYear } = availableWindow(now);
  return {
    addressLine1: blankable(
      trimmed
        .min(3, 'Enter the first line of the address, like 12 Ranelagh Road')
        .max(120, 'Keep the first line under 120 characters'),
    ),
    addressLine2: optionalText(120, 'Keep the second line under 120 characters'),
    area: blankable(
      trimmed
        .min(2, 'Enter the area, like Ranelagh, Dublin 6')
        .max(80, 'Keep the area under 80 characters'),
    ),
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
    rent: blankable(trimmed).transform((value, ctx) => {
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
    availableFrom: blankable(z.string()).transform((date, ctx) => {
      const problem = !/^\d{4}-\d{2}-\d{2}$/.test(date)
        ? 'Choose the date the home is available from'
        : date < today
          ? 'The available date can’t be in the past'
          : date > inAYear
            ? 'Choose a date within the next year'
            : null;
      if (problem) {
        ctx.addIssue({ code: 'custom', message: problem });
        return z.NEVER;
      }
      return date;
    }),
    propertyType: z.enum(Object.keys(propertyTypes) as [keyof typeof propertyTypes], {
      error: 'Choose the type of home',
    }),
    bedrooms: z.coerce
      .number({ error: 'Choose the number of bedrooms' })
      .int('Enter a whole number of bedrooms')
      .min(0, 'Enter 0 for a studio')
      .max(10, 'Enter 10 bedrooms or fewer'),
    /** UX-LT-14: offered, not required. */
    bathrooms: offered(
      z.coerce
        .number({ error: 'Enter the number of bathrooms' })
        .int('Enter a whole number of bathrooms')
        .min(1, 'Enter at least 1 bathroom')
        .max(10, 'Enter 10 bathrooms or fewer'),
    ),
    furnished: offered(
      z.enum(Object.keys(furnishing) as [keyof typeof furnishing], {
        error: 'Choose whether the home is furnished',
      }),
    ),
    /** UX-LT-14: not needed to go live. Needed to show the home on Gaff. */
    berRating: offered(z.enum(berRatings, { error: 'Choose the BER rating' })),
    parking: offered(z.enum(Object.keys(parkingOptions) as [keyof typeof parkingOptions])),
    /**
     * UX-LS-6: the home in the lister's own words. Renters read it, so it passes the
     * protected-ground wording check (rule 3): it describes the home, never who should apply.
     */
    description: blankable(z.string()).transform((value, ctx) => {
      const text = value.replace(/\r\n/g, '\n').trim();
      if (!text) return undefined;
      if (text.length > MAX_DESCRIPTION) {
        ctx.addIssue({
          code: 'custom',
          message: 'Keep the description under 4,000 characters',
        });
        return z.NEVER;
      }
      const problem = homeWordingProblem(text);
      if (problem) {
        ctx.addIssue({ code: 'custom', message: problem });
        return z.NEVER;
      }
      return text;
    }),
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
          const problem = homeWordingProblem(line);
          if (problem) {
            ctx.addIssue({ code: 'custom', message: problem });
            return z.NEVER;
          }
        }
        return lines;
      }),
    /** M39 (BA-14): more facts renters ask about, each offered, never required. */
    ensuites: offered(
      z.coerce
        .number({ error: 'Enter the number of en-suites' })
        .int('Enter a whole number of en-suites')
        .min(1, 'Enter at least 1 en-suite, or leave it blank')
        .max(10, 'Enter 10 en-suites or fewer'),
    ),
    floorAreaSqm: offered(
      z.coerce
        .number({ error: 'Enter the floor area in square metres, like 75' })
        .int('Enter the floor area in whole square metres, like 75')
        .min(MIN_FLOOR_AREA, 'Enter the floor area in square metres, like 75')
        .max(MAX_FLOOR_AREA, 'Enter the floor area in square metres, like 75'),
    ),
    floor: offered(
      z.coerce
        .number({ error: 'Choose the floor' })
        .int('Choose the floor')
        .min(LOWEST_FLOOR, 'Choose the floor')
        .max(HIGHEST_FLOOR, 'Choose the floor'),
    ),
    lift: offered(z.enum(['yes', 'no'])).transform((value) =>
      value === undefined ? undefined : value === 'yes',
    ),
    heating: offered(
      z.enum(Object.keys(heatingTypes) as [keyof typeof heatingTypes], {
        error: 'Choose the heating',
      }),
    ),
    outdoorSpace: offered(
      z.enum(Object.keys(outdoorSpaces) as [keyof typeof outdoorSpaces], {
        error: 'Choose the outdoor space',
      }),
    ),
    /** Checkboxes arrive as one value, "washing_machine,dryer". Unknown ones are left out. */
    appliances: blankable(z.string()).transform((value) => {
      const chosen = value
        .split(',')
        .map((each) => each.trim())
        .filter((each): each is keyof typeof appliances => each in appliances);
      const kept = [...new Set(chosen)];
      return kept.length > 0 ? kept : undefined;
    }),
    broadband: offered(
      z.enum(Object.keys(broadbandTypes) as [keyof typeof broadbandTypes], {
        error: 'Choose the broadband',
      }),
    ),
    /** M40: the number on the BER certificate, where the lister has it. */
    berNumber: blankable(trimmed).transform((value, ctx) => {
      if (!value) return undefined;
      const number = normaliseBerNumber(value);
      if (!number) {
        ctx.addIssue({
          code: 'custom',
          message: 'The BER number has 9 digits, like 104123456. Or leave it blank.',
        });
        return z.NEVER;
      }
      return number;
    }),
    /** M44: a link out to a video or virtual tour, from YouTube, Vimeo or Matterport only. */
    tourUrl: blankable(trimmed).transform((value, ctx) => {
      if (!value) return undefined;
      if (value.length > 300 || !isTourUrl(value)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Add a link from YouTube, Vimeo or Matterport, starting https://',
        });
        return z.NEVER;
      }
      return value;
    }),
    daftUrl: httpsUrl('Enter the link to the advert on daft.ie', ['daft.ie']),
    myhomeUrl: httpsUrl('Enter the link to the advert on myhome.ie', ['myhome.ie']),
  };
}

/**
 * A whole letting at once: what a test or an import hands to `createLetting`. Only an address, a
 * rent, a date, a type and a bedroom count are needed (UX-LT-14); the rest is offered.
 */
export function newLettingSchema(now: Date = new Date()) {
  return z
    .object({
      ...lettingFields(now),
      photosUrl: httpsUrl('Enter a web link to the photos, starting https://'),
      landlordName: optionalText(120, 'Keep the landlord’s name under 120 characters'),
      landlordEmail: blankable(trimmed)
        .transform((value) => value.toLowerCase() || undefined)
        .refine(
          (value) => !value || z.email().safeParse(value).success,
          'Enter the landlord’s email address, like owner@example.ie',
        ),
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
  bathrooms?: number | null;
  furnished?: keyof typeof furnishing | null;
  berRating?: (typeof berRatings)[number] | null;
  parking?: keyof typeof parkingOptions | null;
  /** M39 (BA-14): the further facts, where the lister gave them. */
  more?: MoreFacts | null;
}): Array<{ label: string; value: string }> {
  const facts = [
    { label: 'Type of home', value: propertyTypes[letting.propertyType] },
    {
      label: 'Bedrooms',
      value: letting.bedrooms === 0 ? 'Studio (no separate bedroom)' : String(letting.bedrooms),
    },
  ];
  // UX-LT-14: these are offered, not required. One that wasn't given is left out, never guessed.
  if (letting.bathrooms) facts.push({ label: 'Bathrooms', value: String(letting.bathrooms) });
  if (letting.furnished) facts.push({ label: 'Furnishing', value: furnishing[letting.furnished] });
  if (letting.berRating) {
    facts.push({
      label: 'BER rating',
      value: letting.berRating === 'exempt' ? 'Exempt' : letting.berRating,
    });
  }
  if (letting.parking) facts.push({ label: 'Parking', value: parkingOptions[letting.parking] });
  for (const line of moreFactLines(letting.more ?? {})) {
    facts.push({ label: line.label, value: line.value });
  }
  return facts;
}
