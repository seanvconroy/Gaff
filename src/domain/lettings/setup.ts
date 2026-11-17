import type { GoLiveGate } from '@/domain/organisations/go-live-gate';
import { letsOwnHomes, type OrganisationKind } from '@/domain/organisations/kinds';

/**
 * Stage 1, set up: what stands between a home and Gaff answering its enquiries (UX-LT-14), and
 * what the go-live screen asks for (section 4 of the UX redesign, step 9).
 *
 * A letting needs exactly these to go live: an address, a rent, an available-from date, a type
 * and a bedroom count, a finished rent check, and a confirmed lister. Nothing else blocks it:
 * not viewing times, not letting details, not photos, not comparable rents, not a phone number.
 * Each of those is asked at the stage that uses it (P8).
 */

/** What the letting's page counts for a home in set-up. None of these but the rent check blocks. */
export interface SetupState {
  viewingSlots: number;
  criteriaSet: boolean;
  rentCheckDone: boolean;
  comparables: number;
}

export const REQUIRED_COMPARABLES = 3;

export type GoLiveNeed =
  | 'address'
  | 'rent'
  | 'available_from'
  | 'home'
  | 'rent_check'
  /** UX-AG-2, UX-AG-6: an agency with no licence on the register, or one that has lapsed. */
  | 'lister';

export interface GoLiveFacts {
  addressLine1: string | null;
  area: string | null;
  county: string | null;
  monthlyRentCents: number | null;
  availableFrom: string | null;
  propertyType: string | null;
  bedrooms: number | null;
  /** Recorded, and not asking more than the cap could ever allow (R3). */
  rentCheckDone: boolean;
  /** Whether whoever is letting the home may put one live (`goLiveGate`). */
  gate: GoLiveGate;
}

/**
 * UX-LT-14: what is still missing before this home can go live. An empty list means it can.
 *
 * An agency that is still being confirmed isn't missing anything: the person's decision to go
 * live is kept, and the home goes live when the agency is confirmed (UX-AG-4).
 */
export function goLiveNeeds(facts: GoLiveFacts): GoLiveNeed[] {
  const needs: GoLiveNeed[] = [];
  if (!facts.addressLine1 || !facts.area || !facts.county) needs.push('address');
  if (facts.monthlyRentCents === null) needs.push('rent');
  if (!facts.availableFrom) needs.push('available_from');
  if (!facts.propertyType || facts.bedrooms === null) needs.push('home');
  if (!facts.rentCheckDone) needs.push('rent_check');
  if (!facts.gate.open && !facts.gate.waits) needs.push('lister');
  return needs;
}

/** A letting has its address, rent, date, type and bedrooms from the day it is made. */
export function readyToTakeEnquiries(state: Pick<SetupState, 'rentCheckDone'>): boolean {
  return state.rentCheckDone;
}

export type OnGaffNeed = 'ber' | 'photo';

/**
 * UX-LT-14, UX-LT-22: to be shown on gaff.ie a home also needs a BER (the law asks for it on an
 * advert) and one photo. Neither stops the home going live: a home that isn't shown still runs
 * on Gaff, taking enquiries from Daft and MyHome (UX-LT-21).
 */
export function onGaffNeeds(home: { berRating: string | null; photos: number }): OnGaffNeed[] {
  const needs: OnGaffNeed[] = [];
  if (!home.berRating) needs.push('ber');
  if (home.photos === 0) needs.push('photo');
  return needs;
}

export interface GoLiveAsks {
  /**
   * A number renters can call (Q43). Asked once, the first time the lister puts a home live
   * and has none on file. It is offered, never required: UX-LT-14 lets nothing else block.
   */
  phone: 'offered' | null;
  /**
   * "Confirm it's you" (Q47): a private landlord verifies their identity once, before their
   * first home goes live. THE SEAM for work package WP-24: the check isn't built, so this is
   * `later`, the step is shown as coming, and it holds nothing. WP-24 returns `needed` here
   * while `goLiveGate` says `identity_needed`.
   */
  identity: 'later' | null;
}

/** Step 9, "Anything still to do first, each asked once". */
export function goLiveAsks(lister: {
  kind: OrganisationKind;
  phone: string | null;
  /** Whether this lister has put a home live before. */
  hasGoneLive: boolean;
}): GoLiveAsks {
  const first = !lister.hasGoneLive;
  return {
    phone: first && !lister.phone ? 'offered' : null,
    identity: first && lister.kind === 'private_landlord' ? 'later' : null,
  };
}

/** Whether the lister's own homes: a number is "optional" in so many words for them. */
export function phoneIsOptionalFor(kind: OrganisationKind): boolean {
  return letsOwnHomes(kind);
}

/**
 * UX-LT-24: "Send a test enquiry" is in a live letting's menu until its first real enquiry
 * arrives.
 */
export function canSendTestEnquiry(letting: { status: string; enquiries: number }): boolean {
  return letting.status === 'live' && letting.enquiries === 0;
}

/** UX-LT-23, UX-LP-5: a closed letting's menu has "Let it again". */
export function canLetAgain(letting: { status: string }): boolean {
  return letting.status === 'let' || letting.status === 'withdrawn';
}

/** "Is it advertised anywhere else?": the portals an operator can say, or none. */
export const portals = { daft: 'Daft', myhome: 'MyHome' } as const;
export type Portal = keyof typeof portals;

/**
 * UX-LT-20: a home advertised on Daft or MyHome with no forwarding in place says so as its one
 * task. Whether forwarding is in place is the organisation's, known from what has come through
 * its rule (`forwardingInPlace` in `@/domain/enquiries/forwarding`).
 */
export function needsForwarding(letting: {
  advertisedOn: readonly Portal[] | null;
  forwardingInPlace: boolean;
}): boolean {
  return (letting.advertisedOn?.length ?? 0) > 0 && !letting.forwardingInPlace;
}
