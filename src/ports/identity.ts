/**
 * P15 to P29 (Q48, ADR-0026): every person's identity, checked once with Stripe Identity: a
 * photo of an ID document, and a selfie Stripe compares with it, or the document alone. Gaff
 * sends the person to Stripe's own pages and gets back the result and the verified name: never
 * the document, the selfie, a date of birth or a document number.
 */

export type IdentityReason = 'document' | 'face_mismatch' | 'gave_up';

export type IdentityOutcome =
  | { status: 'passed'; verifiedName: { first: string; last: string } }
  | { status: 'failed'; reason: IdentityReason; consentDeclined?: boolean }
  | { status: 'pending' };

export interface IdentityProvider {
  readonly name: 'stand_in' | 'stripe';
  /**
   * Opens a check, or reopens the person's existing session for another try, as Stripe advises.
   * Only opaque IDs go to the provider, never a name or an email address.
   */
  start(input: {
    checkId: string;
    userId: string;
    selfie: boolean;
    returnUrl: string;
    /** The provider's session from an earlier try, to reuse. */
    providerRef?: string | null;
    attempt: number;
  }): Promise<{ providerRef: string; redirectUrl: string }>;
  /** The outcome of a session, read from the provider after it says something changed. */
  outcome(providerRef: string): Promise<IdentityOutcome>;
  /** P26: asks the provider to delete the documents and selfie it holds for Gaff. */
  redact(providerRef: string): Promise<void>;
}
