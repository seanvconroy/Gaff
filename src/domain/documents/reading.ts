import { z } from 'zod';
import {
  amountPeriods,
  documentKinds,
  isWorkKind,
  type AmountPeriod,
  type DocumentKind,
} from './kinds';

/**
 * P37: what Gaff reads from a document, and nothing else: the kind, the name on it and its date;
 * for work documents the employer, the pay and how often; for Revenue and accountants' documents
 * the tax year and the income for it; for other income the amount and how often, or a balance.
 *
 * Never a PPS number, a bank account number, an address, or what a payment is for. There is no
 * field for any of them, and `checkDocumentReading` refuses a reading that has one in a field it
 * does have: refused, never cleaned, so nothing like one is ever stored (rule 2). For other
 * income there is no payer and no kind of payment: the employer field must be empty (rule 3).
 */
export const readingSchema = z
  .object({
    kind: z.enum([...documentKinds, 'not_recognised']),
    name: z.string().nullable(),
    /** The document's own date: the pay date, the letter's date, the statement's date. */
    date: z.string().nullable(),
    employer: z.string().nullable(),
    /** In cents: take-home pay for a payslip; the pay on a contract; the year's income; an amount. */
    amountCents: z.number().int().nullable(),
    period: z.enum(amountPeriods).nullable(),
    taxYear: z.number().int().nullable(),
  })
  .strict();

export type RawReading = z.infer<typeof readingSchema>;

/** A reading Gaff keeps, sealed, beside the document (and on the letter's side, with its copy). */
export interface DocumentReading {
  kind: DocumentKind | 'not_recognised';
  name: string | null;
  date: string | null;
  employer: string | null;
  amountCents: number | null;
  period: AmountPeriod | null;
  taxYear: number | null;
}

/** An Irish PPS number: seven digits and one or two letters, however it's spaced. */
const PPS = /\b\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?[A-W][A-IW]?\b/i;
/** An IBAN: two letters, two digits, then up to thirty letters and digits, maybe spaced. */
const IBAN = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){10,30}\b/i;
/** Any run of six digits or more: an account number, a sort code, a reference. */
const LONG_NUMBER = /\d(?:[\s-]?\d){5,}/;

/** P37, rule 2: whether some text holds anything like a PPS or account number. */
export function holdsNumberGaffNeverKeeps(text: string): boolean {
  return PPS.test(text) || IBAN.test(text) || LONG_NUMBER.test(text);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** A ten-million-euro limit on any figure: past it, the reading isn't plausible. */
const MAX_AMOUNT_CENTS = 1_000_000_000;

/**
 * Holds what the model said to the rules, or refuses it (null): the strict schema; no PPS,
 * account or other long number in any text; no payer on other income; a real date that isn't
 * in the future or more than six years old; a plausible amount with a period that fits the
 * kind. A refused reading means the document is treated as unread, never as read wrongly.
 */
export function checkDocumentReading(raw: unknown, today: string): DocumentReading | null {
  const parsed = readingSchema.safeParse(raw);
  if (!parsed.success) return null;
  const reading = parsed.data;
  const texts = [reading.name, reading.employer].filter((t): t is string => t !== null);
  if (texts.some(holdsNumberGaffNeverKeeps)) return null;
  if (texts.some((t) => t.length > 120 || t.trim().length === 0)) return null;
  // Rule 3: who pays other income, or what it's for, could reveal a protected ground.
  if (reading.kind === 'other_income' && reading.employer !== null) return null;
  if (reading.date !== null) {
    if (!isRealDate(reading.date)) return null;
    const age = daysBetween(reading.date, today);
    if (age < -7 || age > 6 * 366) return null;
  }
  if (reading.amountCents !== null) {
    if (reading.amountCents <= 0 || reading.amountCents > MAX_AMOUNT_CENTS) return null;
    if (reading.period === null) return null;
  }
  if (reading.period === 'balance' && reading.kind !== 'other_income') return null;
  if (reading.kind === 'payslip' && (reading.period === 'yearly' || reading.period === 'balance')) {
    return null;
  }
  if (reading.taxYear !== null) {
    const year = Number(today.slice(0, 4));
    if (reading.taxYear < year - 6 || reading.taxYear > year) return null;
  }
  return {
    ...reading,
    name: reading.name?.trim() ?? null,
    employer: isWorkKind(reading.kind) ? (reading.employer?.trim() ?? null) : null,
  };
}

/** An empty reading: nothing read yet, for the renter to fill in themselves (P5). */
export function emptyReading(kind: DocumentKind): DocumentReading {
  return {
    kind,
    name: null,
    date: null,
    employer: null,
    amountCents: null,
    period: null,
    taxYear: null,
  };
}
