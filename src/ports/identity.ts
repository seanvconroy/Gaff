/**
 * P15 to P29 (the live line's ADR-0026; Q51 here, ADR-0018): the ID check, a photo of an ID
 * document and a live selfie the provider compares with it. Gaff sends the person to the
 * provider's own pages and gets back only whether it passed, the verified first and last name,
 * and a reason code when it didn't: never the document, the selfie, a date of birth, a document
 * number or a country.
 *
 * Adapters: Stripe Identity (`stripe`), and a stand-in page where a tester picks the result
 * (`stand_in`, never in production).
 */

export type IdentityReason = 'document' | 'face_mismatch' | 'gave_up';

export type IdentityOutcome =
  | { status: 'passed'; verifiedName: { first: string; last: string } }
  | { status: 'failed'; reason: IdentityReason; consentDeclined?: boolean }
  | { status: 'pending' };

/**
 * Whose check it is, for the provider's metadata: a letting's check of a chosen renter (the
 * operator's copy, `checks`) or a person's own check (`identity_checks`).
 */
export type IdentityCheckKind = 'letting' | 'person';

export interface IdentityProvider {
  readonly name: 'stand_in' | 'stripe';
  /**
   * Opens a check, or reopens its existing session for another try, as Stripe advises. Only
   * opaque IDs go to the provider, never a name or an email address.
   */
  start(input: {
    checkId: string;
    kind: IdentityCheckKind;
    returnUrl: string;
    /** The provider's session from an earlier try, to reuse. */
    providerRef?: string | null;
    attempt: number;
  }): Promise<{ providerRef: string; redirectUrl: string }>;
  /** The outcome of a session, read from the provider itself, never from what was posted. */
  outcome(providerRef: string): Promise<IdentityOutcome>;
  /** P26: asks the provider to delete the document and selfie it holds for Gaff. */
  redact(providerRef: string): Promise<void>;
}
