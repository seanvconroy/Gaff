/**
 * P30 to P49 (the live line's ADR-0026; Q51 here): a chosen renter shows their work and income
 * with the documents Irish letters already ask for. These are the only kinds there are. A letter
 * can't add one (Q53): nothing here takes a free-text kind.
 *
 * WORK DOCUMENTS (payslips, a contract or offer letter, an employer's letter, a Revenue Notice
 * of Assessment, an accountant's letter) reach the letter, who may open them while they're
 * kept (P45).
 *
 * A STATEMENT OF OTHER INCOME (a pension, a social welfare payment, maintenance, or savings
 * showing only the balance) never does (P33, rule 3): it can show age, disability, family status
 * or the housing assistance ground. Gaff reads it, the renter confirms what was read, and it is
 * deleted. The letter's copy is a reading alone, as "regular income", unlabelled: the kind
 * `other_income` is not one of `letterKinds`, so the letter's table can't even name it.
 */
export const workKinds = [
  'payslip',
  'contract',
  'employer_letter',
  'revenue_statement',
  'accountant_letter',
] as const;
export type WorkKind = (typeof workKinds)[number];

export const documentKinds = [...workKinds, 'other_income'] as const;
export type DocumentKind = (typeof documentKinds)[number];

/**
 * What the letter's copy can be (`check_documents.kind`): a work document, or a reading of
 * regular income with no file at all. A database constraint holds the second (no storage key).
 */
export const letterKinds = [...workKinds, 'regular_income'] as const;
export type LetterKind = (typeof letterKinds)[number];

/** P45: the letter may open work documents. There is no kind of theirs that isn't one, but one. */
export function letterMayOpen(kind: LetterKind): kind is WorkKind {
  return (workKinds as readonly string[]).includes(kind);
}

/** P33: the kind a renter's document has on the letter's side. Other income loses its kind. */
export function letterKindOf(kind: DocumentKind): LetterKind {
  return kind === 'other_income' ? 'regular_income' : kind;
}

export function isWorkKind(kind: string): kind is WorkKind {
  return (workKinds as readonly string[]).includes(kind);
}

/** How often an amount on a document is paid; `yearly` for Revenue and accountants' figures. */
export const payPeriods = ['weekly', 'fortnightly', 'four_weekly', 'monthly', 'yearly'] as const;
export type PayPeriod = (typeof payPeriods)[number];

/** P33: a savings statement shows only a balance: no period, and nothing about who paid it. */
export const amountPeriods = [...payPeriods, 'balance'] as const;
export type AmountPeriod = (typeof amountPeriods)[number];
