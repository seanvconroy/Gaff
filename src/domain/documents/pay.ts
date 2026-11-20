import type { AmountPeriod } from './kinds';

/**
 * P44: a figure on a document, as about a month, for the letter's view: weekly × 52 ÷ 12,
 * fortnightly × 26 ÷ 12, four-weekly × 13 ÷ 12, yearly ÷ 12, monthly as it is. It's arithmetic
 * on the figure printed, shown as "about" beside the figure itself and the household income from
 * the application. It's not an estimate of anyone's income, and nothing compares it with the
 * letter's rule (rule 1): there's no score, no ratio and no "pass". A balance has no month.
 */
export function aboutAMonth(amountCents: number, period: AmountPeriod): number | null {
  switch (period) {
    case 'weekly':
      return Math.round((amountCents * 52) / 12);
    case 'fortnightly':
      return Math.round((amountCents * 26) / 12);
    case 'four_weekly':
      return Math.round((amountCents * 13) / 12);
    case 'monthly':
      return amountCents;
    case 'yearly':
      return Math.round(amountCents / 12);
    case 'balance':
      return null;
  }
}

/** Rounded to the euro for "about": "about €3,207 a month". */
export function roundedToEuro(cents: number): number {
  return Math.round(cents / 100) * 100;
}
