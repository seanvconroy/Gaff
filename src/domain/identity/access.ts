/**
 * P15 to P29 (Q48, ADR-0026): one identity check per person, kept on their Gaff profile. What
 * each status lets a person do next.
 */

export const identityStatuses = ['pending', 'verified', 'not_verified', 'offline'] as const;
export type IdentityStatus = (typeof identityStatuses)[number];

/** P25: each attempt costs Gaff, so three at most; then "can't be checked online" (P20). */
export const MAX_ATTEMPTS = 3;

/** P26: Stripe deletes the images for Gaff this long after the result. */
export const REDACT_AFTER_DAYS = 30;

/**
 * P18: each version of the selfie consent wording (`src/copy/identity.ts`) a person may have
 * agreed to. A change of wording adds a version; the last is the one shown now.
 */
export const selfieConsentVersions = ['selfie_consent_v1'] as const;
export const SELFIE_CONSENT_VERSION = selfieConsentVersions[selfieConsentVersions.length - 1]!;

export interface IdentityRecord {
  status: IdentityStatus;
  selfie: boolean;
  attempts: number;
  /** Q55: a person at Gaff saw the original ID another way. */
  byPerson?: boolean;
}

/** P29: a person checked once is never asked again. */
export function isChecked(record: IdentityRecord | null): boolean {
  return record?.status === 'verified';
}

/** P25: may this person start another attempt with Stripe? */
export function mayAttempt(record: IdentityRecord | null): boolean {
  if (!record) return true;
  if (record.status === 'verified' || record.status === 'offline') return false;
  return record.attempts < MAX_ATTEMPTS;
}

/**
 * P15, P19, P20, P27: where a chosen renter's identity stands for one letting. "in_person"
 * means the letter sees an original photo ID when they meet, before the agreement is sent:
 * after a check without a selfie, or when the ID can't be checked online.
 */
export type RenterIdentity = 'to_do' | 'started' | 'checked' | 'in_person';

export function renterIdentity(record: IdentityRecord | null): RenterIdentity {
  if (!record) return 'to_do';
  if (record.status === 'verified') return record.selfie ? 'checked' : 'in_person';
  if (record.status === 'offline') return 'in_person';
  return record.status === 'pending' ? 'started' : 'to_do';
}

/** P15, M22: a letter's homes go live once they're checked. */
export function letterChecked(record: IdentityRecord | null): boolean {
  return isChecked(record);
}

/**
 * P19: a letter checked by Stripe without a selfie has their first listing reviewed by a
 * person. Someone whose ID a person at Gaff saw (Q55) has been looked at already.
 */
export function firstListingNeedsReview(record: IdentityRecord | null): boolean {
  return record?.status === 'verified' && !record.selfie && !record.byPerson;
}
