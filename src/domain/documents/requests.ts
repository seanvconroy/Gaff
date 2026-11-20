import type { Earning } from '@/domain/applications/apply';
import type { DocumentKind } from './kinds';

/**
 * P30 to P35: what a chosen renter is asked for depends only on how they said they earn on their
 * application (R16), and is the same on every letting (Q53). Never bank statements, apart from a
 * savings statement showing only the balance, and never anything a letter adds (P35).
 *
 * Income that's on no document, such as a partner's income or help with the rent, stays as the
 * household income they gave on their application, and nothing records what it is (P34, Q17).
 */
export type DocumentAsk =
  /** P31: three most recent payslips; or, after starting in the last three months, a contract. */
  | 'payslips'
  /** P32: the latest Notice of Assessment from Revenue, or a letter from their accountant. */
  | 'self_employed'
  /** P33: a recent statement of each regular income, or a savings statement (balance only). */
  | 'other_income';

export const PAYSLIPS_ASKED = 3;

/** P31 to P33: the one ask for each way of earning. Anyone may add other income too. */
export function documentAskFor(earning: Earning | null): DocumentAsk {
  if (earning === 'employed') return 'payslips';
  if (earning === 'self_employed') return 'self_employed';
  return 'other_income';
}

/** The kinds a renter can say a document is, for their ask: theirs first, other income last. */
export function kindsFor(ask: DocumentAsk): DocumentKind[] {
  switch (ask) {
    case 'payslips':
      return ['payslip', 'contract', 'employer_letter', 'other_income'];
    case 'self_employed':
      return ['revenue_statement', 'accountant_letter', 'other_income'];
    case 'other_income':
      return ['other_income'];
  }
}

/**
 * Whether what's uploaded answers the ask. It never blocks sharing (P38): it only says, in
 * words, what's still to add. Three payslips, or a contract or offer letter for a new job; a
 * Revenue or accountant's document; at least one statement.
 */
export function askAnswered(ask: DocumentAsk, kinds: readonly DocumentKind[]): boolean {
  const count = (kind: DocumentKind) => kinds.filter((k) => k === kind).length;
  switch (ask) {
    case 'payslips':
      return count('payslip') >= PAYSLIPS_ASKED || count('contract') > 0;
    case 'self_employed':
      return count('revenue_statement') > 0 || count('accountant_letter') > 0;
    case 'other_income':
      return count('other_income') > 0;
  }
}

/** P55: ten uploads per check, at most. */
export const MAX_DOCUMENTS_PER_CHECK = 10;
