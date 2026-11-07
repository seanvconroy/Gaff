/**
 * M40, M100: the BER every advert must show (S.I. 243 of 2012, SEAI's advertising
 * guidelines). Certificates issued from 24 May 2026 use a new scale, so a rating is stored
 * with its scale and shown on it.
 *
 * The new scale's labels follow the A to G classes of the recast EU directive. The solicitor
 * checks them against SEAI's current guidelines before launch (Q36).
 */

export const NEW_SCALE_FROM = '2026-05-24';

export const previousScaleRatings = [
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
] as const;

export const newScaleRatings = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;

export type BerScale = 'previous' | 'new';

export const exemptReasons = {
  protected_structure: 'A protected structure',
  other: 'Exempt under the BER regulations',
} as const;

export type Ber =
  | { kind: 'rated'; scale: BerScale; rating: string; number?: string; certificateDate?: string }
  | { kind: 'exempt'; reason: keyof typeof exemptReasons };

/** The scale a certificate uses, from the date it was issued (ISO date). */
export function scaleForCertificate(issuedOn: string): BerScale {
  return issuedOn >= NEW_SCALE_FROM ? 'new' : 'previous';
}

export function ratingsFor(scale: BerScale): readonly string[] {
  return scale === 'new' ? newScaleRatings : previousScaleRatings;
}

/** Words for the letter if the BER isn't valid, or null. */
export function berProblem(ber: Ber): string | null {
  if (ber.kind === 'exempt') return null;
  if (!ratingsFor(ber.scale).includes(ber.rating)) {
    return ber.scale === 'new'
      ? 'Choose a rating from A to G, as on the certificate'
      : 'Choose a rating from A1 to G, as on the certificate';
  }
  if (ber.number !== undefined && !/^\d{9}$/.test(ber.number)) {
    return 'The BER number has 9 digits, like 104123456. Leave it blank if you don’t have it';
  }
  if (ber.certificateDate && scaleForCertificate(ber.certificateDate) !== ber.scale) {
    return ber.scale === 'new'
      ? 'Certificates issued before 24 May 2026 use the A1 to G scale'
      : 'Certificates issued from 24 May 2026 use the A to G scale';
  }
  return null;
}

/** How a listing shows it: "BER C2", "BER B", or "BER exempt". */
export function berLabel(ber: Ber): string {
  return ber.kind === 'exempt' ? 'BER exempt' : `BER ${ber.rating}`;
}

/**
 * The letter band, A to G, for the "minimum BER" filter (M58). Ratings on the two scales
 * share their letter bands; an exempt home has none.
 */
export function berBand(ber: Ber): string | null {
  return ber.kind === 'exempt' ? null : ber.rating.charAt(0);
}

/** The workflow's ratings (R1) are on the previous scale, or "exempt". */
export function berFromLettingRating(rating: string): Ber {
  return rating === 'exempt'
    ? { kind: 'exempt', reason: 'other' }
    : { kind: 'rated', scale: 'previous', rating };
}
