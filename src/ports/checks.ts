/**
 * R18: a chosen renter's checks. The ID check runs with its provider (./identity.ts); work and
 * income are shown with documents (BA-16, src/server/documents), never open banking (Q51).
 */

/** What an ID check's result is recorded as (src/ports/identity.ts reads it from the provider). */
export type IdentityResult =
  | { verified: true; verifiedName: string }
  | {
      verified: false;
      reason: 'document' | 'face_mismatch' | 'gave_up';
      /** P18: they said no on the provider's own consent screen: not one of their tries. */
      consentDeclined?: boolean;
    };
