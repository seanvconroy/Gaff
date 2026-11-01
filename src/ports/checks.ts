/**
 * R18: ID checks (document and selfie) and income checks (read-only open banking) are run by
 * providers the founders approve (rule 10). Gaff sends the renter to the provider and gets a
 * result back; it never sees or keeps the document, the selfie or the bank statements.
 */
export interface CheckProvider {
  start(input: {
    checkId: string;
    returnUrl: string;
  }): Promise<{ providerRef: string; redirectUrl: string }>;
}

export type IdentityResult =
  | { verified: true; verifiedName: string }
  | { verified: false; reason: 'document' | 'face_mismatch' | 'gave_up' };

export type IncomeResult =
  | { confirmed: true; monthlyIncomeCents: number }
  | { confirmed: false; reason: 'no_regular_income' | 'gave_up' };
