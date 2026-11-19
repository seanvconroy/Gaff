/**
 * R18: income checks (read-only open banking, for now a stand-in) are run by providers the
 * founders approve (rule 10). Gaff sends the renter to the provider and gets a result back; it
 * never sees or keeps the bank statements. The ID check has its own port (./identity.ts).
 */
export interface CheckProvider {
  start(input: {
    checkId: string;
    returnUrl: string;
  }): Promise<{ providerRef: string; redirectUrl: string }>;
}

/** What an ID check's result is recorded as (src/ports/identity.ts reads it from the provider). */
export type IdentityResult =
  | { verified: true; verifiedName: string }
  | {
      verified: false;
      reason: 'document' | 'face_mismatch' | 'gave_up';
      /** P18: they said no on the provider's own consent screen: not one of their tries. */
      consentDeclined?: boolean;
    };

export type IncomeResult =
  | { confirmed: true; monthlyIncomeCents: number }
  | { confirmed: false; reason: 'no_regular_income' | 'gave_up' };
