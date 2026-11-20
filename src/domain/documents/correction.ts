import { amountPeriods, type AmountPeriod, type DocumentKind, isWorkKind } from './kinds';
import { holdsNumberGaffNeverKeeps, isRealDate, type DocumentReading } from './reading';

/**
 * P39, P5: the renter sees what Gaff read and corrects it, or, where Gaff couldn't read it,
 * enters what it says. What they enter is held to the same rules as a reading: no PPS or
 * account number in any field, no payer of other income (there's no field for one), a real
 * date, and an amount with how often it's paid. A correction is shown to the letter as changed
 * by the renter. Errors are codes, at the field; the page says each in words (src/copy).
 */
export type CorrectionError =
  'name_missing' | 'number_kept_out' | 'date' | 'amount' | 'period' | 'tax_year';

export interface CorrectionValues {
  name?: string;
  date?: string;
  employer?: string;
  amount?: string;
  period?: string;
  taxYear?: string;
}

const euro = /^€?\s*(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/;

export function correctedReading(
  kind: DocumentKind,
  values: CorrectionValues,
  today: string,
):
  | { ok: true; reading: DocumentReading }
  | { ok: false; errors: Partial<Record<keyof CorrectionValues, CorrectionError>> } {
  const errors: Partial<Record<keyof CorrectionValues, CorrectionError>> = {};
  const name = (values.name ?? '').trim().slice(0, 120);
  const employer = isWorkKind(kind) ? (values.employer ?? '').trim().slice(0, 120) : '';
  if (!name) errors.name = 'name_missing';
  else if (holdsNumberGaffNeverKeeps(name)) errors.name = 'number_kept_out';
  if (employer && holdsNumberGaffNeverKeeps(employer)) errors.employer = 'number_kept_out';
  const date = (values.date ?? '').trim();
  if (date && (!isRealDate(date) || date > today)) errors.date = 'date';
  const amountText = (values.amount ?? '').trim();
  let amountCents: number | null = null;
  if (amountText) {
    if (!euro.test(amountText)) errors.amount = 'amount';
    else amountCents = Math.round(Number(amountText.replace(/[€,\s]/g, '')) * 100);
    if (amountCents !== null && (amountCents <= 0 || amountCents > 1_000_000_000)) {
      errors.amount = 'amount';
    }
  }
  const period = (values.period ?? '').trim();
  const known = (amountPeriods as readonly string[]).includes(period);
  if (amountText && !known) errors.period = 'period';
  if (period === 'balance' && kind !== 'other_income') errors.period = 'period';
  const yearText = (values.taxYear ?? '').trim();
  const year = Number(today.slice(0, 4));
  const taxYear = yearText ? Number(yearText) : null;
  if (taxYear !== null && (!Number.isInteger(taxYear) || taxYear < year - 6 || taxYear > year)) {
    errors.taxYear = 'tax_year';
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    reading: {
      kind,
      name,
      date: date || null,
      employer: employer || null,
      amountCents,
      period: amountCents === null ? null : (period as AmountPeriod),
      taxYear,
    },
  };
}
