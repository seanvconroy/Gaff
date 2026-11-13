/**
 * P15 to P29 (Q48, Q60, ADR-0026): one identity check per person, kept on their Gaff profile:
 * a photo ID and a live selfie, matched by Stripe Identity, with no other way through. What
 * each status lets a person do next.
 */

/** "offline" is kept only for checks recorded before Q60; nothing sets it now. */
export const identityStatuses = ['pending', 'verified', 'not_verified', 'offline'] as const;
export type IdentityStatus = (typeof identityStatuses)[number];

/** P25: each attempt costs Gaff, so three at most, until a person at Gaff gives more. */
export const MAX_ATTEMPTS = 3;

/** P26: Stripe deletes the images for Gaff this long after the result. */
export const REDACT_AFTER_DAYS = 30;

/**
 * P18: each version of the selfie consent wording (`src/copy/identity.ts`) a person may have
 * agreed to. A change of wording adds a version; the last is the one shown now.
 */
export const selfieConsentVersions = ['selfie_consent_v1', 'selfie_consent_v2'] as const;
export const SELFIE_CONSENT_VERSION = selfieConsentVersions[selfieConsentVersions.length - 1]!;

export interface IdentityRecord {
  status: IdentityStatus;
  selfie: boolean;
  attempts: number;
}

/**
 * P17, P29, Q60: checked means a photo ID and a live selfie, matched. A check recorded before
 * Q60 without a selfie has to be done again, with one.
 */
export function isChecked(record: IdentityRecord | null): boolean {
  return record?.status === 'verified' && record.selfie;
}

/** P25: may this person start another attempt with Stripe? */
export function mayAttempt(record: IdentityRecord | null): boolean {
  if (!record) return true;
  if (isChecked(record)) return false;
  return record.attempts < MAX_ATTEMPTS;
}

/** P15, P25: where a person's identity check stands, for the page that asks for it. */
export type IdentityStage = 'to_do' | 'started' | 'checked' | 'no_tries_left';

export function identityStage(record: IdentityRecord | null): IdentityStage {
  if (isChecked(record)) return 'checked';
  if (record?.status === 'pending') return 'started';
  return mayAttempt(record) ? 'to_do' : 'no_tries_left';
}
