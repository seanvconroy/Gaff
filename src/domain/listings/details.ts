import { z } from 'zod';
import {
  accessibilityFeatures,
  appliances,
  broadbandTypes,
  heatingTypes,
  outdoorSpaces,
} from '@/domain/homes/facts';
import { parseEuroToCents } from '@/domain/lettings/new-letting';

/**
 * M37 to M44, M52: what the listing editor adds to a letting's set-up (R1): the facts renters
 * filter on, the deposit, the words, and when enquiries close. Form fields arrive as strings.
 */

const blank = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());
const optionalInt = (min: number, max: number, message: string) =>
  z.preprocess(blank, z.string()).transform((v, ctx) => {
    if (v === '') return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return n;
  });
const keysOf = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string];
const optionalEnum = <T extends Record<string, string>>(o: T, message: string) =>
  z.preprocess(blank, z.string()).transform((v, ctx) => {
    if (v === '') return null;
    if (!(v in o)) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return v as keyof T & string;
  });
const manyOf = <T extends Record<string, string>>(o: T) =>
  z.preprocess(blank, z.string()).transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is keyof T & string => s in o),
  );

export const TOUR_HOSTS = ['youtube.com', 'youtu.be', 'vimeo.com', 'matterport.com'];

export function tourUrlProblem(url: string): string | null {
  try {
    const parsed = new URL(url);
    const ok =
      parsed.protocol === 'https:' &&
      TOUR_HOSTS.some((h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
    return ok ? null : 'Add a link from YouTube, Vimeo or Matterport, starting https://';
  } catch {
    return 'Add a link from YouTube, Vimeo or Matterport, starting https://';
  }
}

/** M38 to M40: facts about the home itself. */
export const homeDetailsSchema = z.object({
  showExactAddress: z.enum(['yes', 'no'], { error: 'Choose how much of the address to show' }),
  heating: optionalEnum(heatingTypes, 'Choose the heating'),
  outdoorSpace: optionalEnum(outdoorSpaces, 'Choose the outdoor space'),
  floorAreaSqm: optionalInt(10, 2000, 'Enter the floor area in square metres, like 75'),
  floor: optionalInt(-1, 60, 'Enter the floor, like 2, or 0 for the ground floor'),
  hasLift: z
    .preprocess(blank, z.enum(['', 'yes', 'no']))
    .transform((v) => (v === '' ? null : v === 'yes')),
  ensuites: optionalInt(0, 10, 'Enter the number of en-suites'),
  accessibility: manyOf(accessibilityFeatures),
  appliances: manyOf(appliances),
  broadband: optionalEnum(broadbandTypes, 'Choose the broadband'),
  berNumber: z.preprocess(blank, z.string()).transform((v, ctx) => {
    if (v === '') return null;
    const digits = v.replace(/\s/g, '');
    if (!/^\d{9}$/.test(digits)) {
      ctx.addIssue({ code: 'custom', message: 'The BER number has 9 digits, like 104123456' });
      return z.NEVER;
    }
    return digits;
  }),
  berCertificateDate: z
    .preprocess(blank, z.string())
    .transform((v) => (v === '' ? null : v))
    .refine(
      (v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v),
      'Enter the date on the certificate',
    ),
});
export type HomeDetails = z.output<typeof homeDetailsSchema>;

/** M39, M44, M52: the deposit, a tour link and when enquiries close. */
export function lettingDetailsSchema(rentCents: number, now: Date = new Date()) {
  return z.object({
    deposit: z.preprocess(blank, z.string()).transform((v, ctx) => {
      const cents = parseEuroToCents(v === '' ? 'x' : v);
      if (cents === null) {
        ctx.addIssue({ code: 'custom', message: 'Enter the deposit in euro, like 1,850, or 0' });
        return z.NEVER;
      }
      if (cents > rentCents) {
        ctx.addIssue({
          code: 'custom',
          message: 'The deposit can’t be more than one month’s rent',
        });
        return z.NEVER;
      }
      return cents;
    }),
    tourUrl: z.preprocess(blank, z.string()).transform((v, ctx) => {
      if (v === '') return null;
      const problem = tourUrlProblem(v);
      if (problem) {
        ctx.addIssue({ code: 'custom', message: problem });
        return z.NEVER;
      }
      return v;
    }),
    enquiryLimit: optionalInt(5, 5000, 'Enter a number of enquiries, like 200, or leave it blank'),
    enquiriesCloseAt: z.preprocess(blank, z.string()).transform((v, ctx) => {
      if (v === '') return null;
      const at = new Date(v);
      if (Number.isNaN(at.getTime()) || at <= now) {
        ctx.addIssue({ code: 'custom', message: 'Choose a time in the future, or leave it blank' });
        return z.NEVER;
      }
      return at;
    }),
  });
}

export const descriptionSchema = z
  .string()
  .trim()
  .max(4000, 'Keep the description under 4,000 characters');

export { keysOf };
