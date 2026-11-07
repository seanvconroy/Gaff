/**
 * M24: the document-and-selfie check on private landlords, with Stripe Identity (approved for
 * this by Sean on 7 November 2026, Q29). Gaff sends the landlord to the provider and gets back a
 * result and the verified name; it never sees or keeps the document, the selfie or a date of birth.
 */

export type IdentityOutcome =
  | { status: 'passed'; verifiedName: string }
  | { status: 'failed'; reason: 'document' | 'face_mismatch' | 'gave_up' }
  | { status: 'pending' };

export interface LetterIdentityProvider {
  readonly name: 'stand_in' | 'stripe';
  start(input: {
    checkId: string;
    organisationId: string;
    returnUrl: string;
  }): Promise<{ providerRef: string; redirectUrl: string }>;
  /** The outcome of a session, read from the provider after it tells Gaff something changed. */
  outcome(providerRef: string): Promise<IdentityOutcome>;
  /** Asks the provider to delete the documents and selfie it holds (M24, 30 days after). */
  redact(providerRef: string): Promise<void>;
}
