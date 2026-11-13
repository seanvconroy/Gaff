/**
 * R18: the income check (read-only open banking, later; a stand-in for now) is run by a
 * provider the founders approve (rule 10). Gaff sends the renter to the provider and gets a
 * result back; it never sees or keeps their statements. Identity has its own port
 * (`./identity.ts`).
 */
export interface CheckProvider {
  start(input: {
    checkId: string;
    returnUrl: string;
  }): Promise<{ providerRef: string; redirectUrl: string }>;
}

export type IncomeResult =
  | { confirmed: true; monthlyIncomeCents: number }
  | { confirmed: false; reason: 'no_regular_income' | 'gave_up' };
