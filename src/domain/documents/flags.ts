import { namesMatch } from '@/domain/identity/identity';
import type { DocumentKind } from './kinds';
import { daysBetween, type DocumentReading } from './reading';

/**
 * P38: Gaff checks each document as soon as it's read, and says at once what to fix: whether
 * it's the kind asked for, whether it's in the name on their ID (by the redesign's name rule,
 * `namesMatch`), and whether it's recent. Nothing here rejects anyone or blocks sharing: the
 * renter can share anyway, and the letter sees what didn't match, in `warning`, with a plain
 * reason and what to do (P46). Gaff says what it checked, and that it can't tell a forgery.
 */
export const documentFlags = [
  /** It isn't the kind the renter said, or not one of the kinds asked for. */
  'kind_differs',
  /** The name on it isn't the name on their ID (or, with no ID check yet, their application). */
  'name_differs',
  /** Older than the ask allows: six weeks for the latest payslip, three months for a letter or statement, the last two tax years for Revenue. */
  'out_of_date',
  /** Gaff couldn't read it: the renter entered what it says, or a person will look at it. */
  'not_read',
] as const;
export type DocumentFlag = (typeof documentFlags)[number];

/** P38: the latest payslip should be dated in the last six weeks. */
export const PAYSLIP_RECENT_DAYS = 42;
/** P38: letters and other statements, in the last three months. */
export const LETTER_RECENT_MONTHS = 3;

function monthsBefore(today: string, months: number): string {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1 - months, d));
  return date.toISOString().slice(0, 10);
}

/** Whether a document dated `date` is recent enough for its kind, on `today`. */
export function isRecent(
  kind: DocumentKind,
  reading: Pick<DocumentReading, 'date' | 'taxYear'>,
  today: string,
): boolean {
  if (kind === 'revenue_statement') {
    const year = reading.taxYear ?? (reading.date ? Number(reading.date.slice(0, 4)) : null);
    return year !== null && year >= Number(today.slice(0, 4)) - 2;
  }
  if (!reading.date) return false;
  if (kind === 'payslip') return daysBetween(reading.date, today) <= PAYSLIP_RECENT_DAYS;
  return reading.date >= monthsBefore(today, LETTER_RECENT_MONTHS);
}

export interface FlagContext {
  /** The kind the renter said it is, when they uploaded it. */
  said: DocumentKind;
  /** The kinds asked for, for how they earn (`kindsFor`). */
  asked: readonly DocumentKind[];
  /** The name to match: their verified name if they have one, or the name on the application. */
  name: string;
  today: string;
  /** For payslips: the date of their newest payslip, which alone has to be recent. */
  newestPayslip?: string | null;
}

/** P38: what a person should look at in one document's reading. */
export function flagsFor(reading: DocumentReading | null, context: FlagContext): DocumentFlag[] {
  if (!reading) return ['not_read'];
  const flags: DocumentFlag[] = [];
  const kind = reading.kind === 'not_recognised' ? null : reading.kind;
  if (kind === null || kind !== context.said || !context.asked.includes(kind)) {
    flags.push('kind_differs');
  }
  if (reading.name !== null && !namesMatch(reading.name, context.name)) flags.push('name_differs');
  const judged = kind ?? context.said;
  // Only the newest payslip must be recent: the two before it are older by nature.
  const isNewest =
    judged !== 'payslip' || !context.newestPayslip || reading.date === context.newestPayslip;
  if (isNewest && !isRecent(judged, reading, context.today)) flags.push('out_of_date');
  return flags;
}

/**
 * The newest payslip's date among a renter's documents, so only it is held to six weeks.
 */
export function newestPayslipDate(
  readings: ReadonlyArray<{ kind: DocumentKind | 'not_recognised'; date: string | null }>,
): string | null {
  const dates = readings
    .filter((r) => r.kind === 'payslip' && r.date !== null)
    .map((r) => r.date!)
    .sort();
  return dates.at(-1) ?? null;
}

/**
 * P38: an employer's referee at a common personal address (rather than a work one) is flagged
 * to the letter: "Gaff sent this reference to a personal email address". Never blocked: small
 * employers often use one.
 */
export const PERSONAL_EMAIL_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'outlook.ie',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'live.ie',
  'msn.com',
  'yahoo.com',
  'yahoo.ie',
  'yahoo.co.uk',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'eircom.net',
] as const;

export function isPersonalEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  return (PERSONAL_EMAIL_DOMAINS as readonly string[]).includes(domain);
}
