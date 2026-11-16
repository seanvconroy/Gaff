import type { OrganisationKind } from './kinds';

/**
 * UX-AG-4, UX-AG-6 (Q32, rule 5): whether a home can go live for whoever is letting it. Going
 * live is the only thing ever held: adding lettings, viewing times and criteria never are.
 *
 * - An agency needs a licence found on the PSRA register, and someone at Gaff to have confirmed
 *   that its first admin works there. While it's "being confirmed", a person's decision to go
 *   live is kept, and the home goes live when the agency is confirmed (`waits`).
 * - An agency whose licence has lapsed keeps its live lettings; no new one goes live until the
 *   licence is back on the register.
 * - A landlord's team lets its own homes: there's no licence to find.
 *
 * THE PRIVATE LANDLORD'S SEAM (Q47, work package WP-24): a private landlord verifies their
 * identity once, before their first home goes live. That check isn't built, so their go-live is
 * open. WP-24 passes `identityVerified` here and adds the `identity_needed` reason; every caller
 * already goes through this one rule.
 */
export type GoLiveHold = 'no_licence' | 'being_confirmed' | 'licence_lapsed';

export type GoLiveGate =
  | { open: true }
  | {
      open: false;
      reason: GoLiveHold;
      /** The decision to go live is kept, and the home goes live when the reason is gone. */
      waits: boolean;
    };

export interface LettingOrganisation {
  kind: OrganisationKind;
  /** The agency's licence number, from its entry in the register. */
  psraLicenceNumber: string | null;
  confirmedAt: Date | null;
  licenceLapsedAt: Date | null;
}

export function goLiveGate(organisation: LettingOrganisation): GoLiveGate {
  if (organisation.kind !== 'agency') return { open: true };
  if (!organisation.psraLicenceNumber) return { open: false, reason: 'no_licence', waits: false };
  if (organisation.licenceLapsedAt) return { open: false, reason: 'licence_lapsed', waits: false };
  if (!organisation.confirmedAt) return { open: false, reason: 'being_confirmed', waits: true };
  return { open: true };
}

/** UX-AG-4: an agency someone at Gaff has yet to confirm. */
export function isBeingConfirmed(organisation: LettingOrganisation): boolean {
  return organisation.kind === 'agency' && organisation.confirmedAt === null;
}

/**
 * UX-AG-7: the licence number shown to renters, owners and referees, on pages, in emails and in
 * the agreement. Only a confirmed agency's: until someone at Gaff has confirmed the agency, the
 * number proves nothing about who is using it (Q32), so it isn't shown in its name.
 */
export function licenceToShow(
  organisation: Pick<LettingOrganisation, 'kind' | 'psraLicenceNumber' | 'confirmedAt'>,
): string | null {
  if (organisation.kind !== 'agency' || !organisation.confirmedAt) return null;
  return organisation.psraLicenceNumber?.trim() || null;
}
