import { z } from 'zod';

/**
 * R3: rent check under the rental law changes from 1 March 2026.
 *
 * Rules as described by public commentary on the Residential Tenancies (Miscellaneous
 * Provisions) Act 2026, gathered 31 October 2026 (rtb.ie could not be reached from the
 * build environment):
 * - Matheson, "Welcome reform: unpacking Ireland's new residential tenancy legislation"
 * - Mason Hayes & Curran, "Rental Market Reforms"
 * - RDJ, "Rent pressure zones to be extended to cover the entire country"
 * - RentSmart, "Can landlords reset rents to market value in Ireland in 2026?"
 * Summary:
 * - Rent pressure zones are replaced by national rent control from 1 March 2026.
 * - Rent can be reset to market at the start of a new tenancy only where the previous
 *   tenancy began on or after 1 March 2026 and ended because the tenant left voluntarily,
 *   breached their obligations, or the home no longer suited their needs.
 * - Where the previous tenancy began before 1 March 2026, the rent can't be reset to market
 *   (one source mentions an exception for substantial refurbishment: we send that to advice).
 * - Otherwise increases are capped at the lower of inflation (CPI/HICP) or 2% a year.
 * - Setting rent needs three comparable rents from the RTB Rent Register (R4).
 *
 * NOT legal advice. The solicitor confirms this table before launch (launch checklist).
 */
export const RENT_RULES_VERSION = 'ie-2026-03-v1';
export const NEW_RULES_START = '2026-03-01';
const MAX_ANNUAL_INCREASE = 0.02;

export const endings = {
  tenant_left: 'The tenant chose to leave',
  tenant_breach: 'It ended because the tenant broke the terms of the tenancy',
  unsuitable: 'The home no longer suited the tenant’s needs',
  landlord_other:
    'The landlord ended it for another reason, like selling or a family member moving in',
} as const;
export type Ending = keyof typeof endings;

export type RentCheckInput =
  | { lastLet: 'never' }
  | {
      lastLet: 'before_new_rules' | 'under_new_rules';
      ending: Ending;
      substantialChange: boolean;
      previousRentCents: number;
      previousRentSetOn: string;
    };

export type RentCheckOutcome =
  | { result: 'market'; reason: 'first_letting' | 'tenant_ended' }
  | { result: 'capped'; reason: 'tenancy_before_new_rules' | 'landlord_ended' }
  | { result: 'get_advice'; reason: 'substantial_change' };

/** Whether market rent can be set for the new tenancy, or the cap applies. */
export function checkRent(input: RentCheckInput): RentCheckOutcome {
  if (input.lastLet === 'never') return { result: 'market', reason: 'first_letting' };
  if (input.lastLet === 'before_new_rules') {
    return input.substantialChange
      ? { result: 'get_advice', reason: 'substantial_change' }
      : { result: 'capped', reason: 'tenancy_before_new_rules' };
  }
  return input.ending === 'landlord_other'
    ? { result: 'capped', reason: 'landlord_ended' }
    : { result: 'market', reason: 'tenant_ended' };
}

/**
 * The most the rent could be under the cap if inflation were at or above 2% every year since
 * the rent was set. The real cap can only be lower (it follows inflation up to 2%), so an
 * advertised rent above this is certainly too high. Compounding keeps the bound generous.
 */
export function capCeilingCents(previousRentCents: number, setOn: string, today: string): number {
  const years = Math.max(0, calendarMonthsBetween(setOn, today) / 12);
  return Math.floor(previousRentCents * (1 + MAX_ANNUAL_INCREASE) ** years);
}

/** Calendar months from one date to another, with part months as a fraction. */
function calendarMonthsBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number) as [number, number, number];
  const [y2, m2, d2] = to.split('-').map(Number) as [number, number, number];
  const daysInMonth = new Date(Date.UTC(y1, m1, 0)).getUTCDate();
  return (y2 - y1) * 12 + (m2 - m1) + (d2 - d1) / daysInMonth;
}

export function rentCheckFormSchema(today: string) {
  return z
    .object({
      lastLet: z.enum(['never', 'before_new_rules', 'under_new_rules'], {
        error: 'Choose whether the home has been let before, and when',
      }),
      ending: z.string().optional(),
      substantialChange: z.string().optional(),
      previousRent: z.string().optional(),
      previousRentSetOn: z.string().optional(),
    })
    .transform((value, ctx): RentCheckInput => {
      if (value.lastLet === 'never') return { lastLet: 'never' };
      if (!value.ending || !(value.ending in endings)) {
        ctx.addIssue({
          code: 'custom',
          path: ['ending'],
          message: 'Choose how the last tenancy ended',
        });
      }
      const cents = value.previousRent
        ? Math.round(Number(value.previousRent.replace(/[€,\s]/g, '')) * 100)
        : NaN;
      if (!Number.isFinite(cents) || cents < 100_00 || cents > 20_000_00) {
        ctx.addIssue({
          code: 'custom',
          path: ['previousRent'],
          message: 'Enter the last monthly rent in euro, like 1,700',
        });
      }
      const setOn = value.previousRentSetOn ?? '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(setOn) || setOn > today) {
        ctx.addIssue({
          code: 'custom',
          path: ['previousRentSetOn'],
          message: 'Enter the date the last rent was set. It can’t be in the future.',
        });
      } else if (value.lastLet === 'under_new_rules' && setOn < NEW_RULES_START) {
        ctx.addIssue({
          code: 'custom',
          path: ['previousRentSetOn'],
          message:
            'A tenancy that began on or after 1 March 2026 can’t have had its rent set before then',
        });
      }
      if (
        value.lastLet === 'before_new_rules' &&
        value.substantialChange !== 'yes' &&
        value.substantialChange !== 'no'
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['substantialChange'],
          message: 'Choose whether the home has been substantially changed',
        });
      }
      return {
        lastLet: value.lastLet,
        ending: value.ending as Ending,
        substantialChange: value.substantialChange === 'yes',
        previousRentCents: cents,
        previousRentSetOn: setOn,
      };
    });
}
