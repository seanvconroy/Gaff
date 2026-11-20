import { aboutAMonth, roundedToEuro } from '@/domain/documents/pay';
import type { DocumentFlag } from '@/domain/documents/flags';
import type { AmountPeriod, DocumentKind, LetterKind } from '@/domain/documents/kinds';
import type { DocumentAsk } from '@/domain/documents/requests';
import { formatDate, formatEuro } from '@/lib/format';

/**
 * BA-16 (P30 to P49): every word a chosen renter and the letting's team see about work and
 * income documents. Fixed wording, for the solicitor's list with the templates. Plain, warm
 * Irish English; no exclamation marks; a flag is `warning` with a plain reason and what to do,
 * never `danger` and never a refusal. Pinned by src/copy/documents.test.ts.
 */

/** A reading as either side sees it: only what Gaff keeps. */
export interface ReadingWords {
  name: string | null;
  date: string | null;
  employer: string | null;
  amountCents: number | null;
  period: AmountPeriod | null;
  taxYear: number | null;
}

const kindNames: Record<DocumentKind, string> = {
  payslip: 'Payslip',
  contract: 'Contract or job offer',
  employer_letter: 'Letter from your employer',
  revenue_statement: 'Notice of Assessment from Revenue',
  accountant_letter: 'Letter from your accountant',
  other_income: 'Statement of other income or savings',
};

const letterKindNames: Record<LetterKind, string> = {
  payslip: 'Payslip',
  contract: 'Contract or job offer',
  employer_letter: 'Letter from their employer',
  revenue_statement: 'Notice of Assessment from Revenue',
  accountant_letter: 'Letter from their accountant',
  regular_income: 'Regular income',
};

const every: Record<AmountPeriod, string> = {
  weekly: 'a week',
  fortnightly: 'every two weeks',
  four_weekly: 'every four weeks',
  monthly: 'a month',
  yearly: 'a year',
  balance: '',
};

/** "€1,480 every two weeks", or "a balance of €12,500". */
function amountWords(reading: ReadingWords, payslip: boolean): string | null {
  if (reading.amountCents === null || reading.period === null) return null;
  const amount = formatEuro(reading.amountCents);
  if (reading.period === 'balance') return `a balance of ${amount}`;
  return `${amount}${payslip ? ' take-home' : ''} ${every[reading.period]}`;
}

/** What a document showed, in one line: "Acme Ltd, €1,480 take-home every two weeks, dated Friday 31 October". */
export function readingInWords(kind: DocumentKind | LetterKind, reading: ReadingWords): string {
  const parts: string[] = [];
  if (reading.employer && kind !== 'other_income' && kind !== 'regular_income') {
    parts.push(reading.employer);
  }
  const amount = amountWords(reading, kind === 'payslip');
  if (amount) parts.push(amount);
  if (reading.taxYear !== null) parts.push(`for ${reading.taxYear}`);
  if (reading.date) {
    parts.push(
      kind === 'contract'
        ? `from ${formatDate(reading.date)}`
        : `dated ${formatDate(reading.date)}`,
    );
  }
  if (reading.name) parts.push(`in the name ${reading.name}`);
  const line = parts.join(', ');
  return line ? `${line.charAt(0).toUpperCase()}${line.slice(1)}.` : 'Nothing read from it yet.';
}

/** The renter's own page: "Your work and income" (P30 to P41). */
export const renterDocumentsCopy = {
  kind: (kind: DocumentKind) => kindNames[kind],
  /** P31 to P33: what is asked, by how they said they earn. */
  ask: {
    payslips:
      'Add your three most recent payslips. If you started your job in the last three months, add your contract or job offer instead.',
    self_employed:
      'Add your latest Notice of Assessment from Revenue, or a letter from your accountant.',
    other_income:
      'Add a recent statement of each regular payment you get, such as a pension or another payment. If you live on savings, add a statement that shows only the balance.',
  } satisfies Record<DocumentAsk, string>,
  /** P34: income on no document stays as they gave it. */
  otherIncome:
    'If some of your household income isn’t on any document, that’s fine: it stays as you gave it on your application.',
  /** UX-RN-16, P30: who sees it and when it's deleted, in one line, with "More". */
  keeps: (operator: string) =>
    `Only ${operator} sees your documents, and their copy is deleted once the tenancy starts or the letting closes, 30 days after you share at the latest.`,
  more: (operator: string) =>
    `Gaff reads each document to check it’s the kind asked for, in your name and recent. It reads only the name, the date and the pay, never your PPS number or bank details. ${operator} can open payslips and letters from employers or accountants. A statement of other income is never shown to ${operator}: they see only the amount, how often it’s paid and the date, and the statement is deleted when you share. Gaff can’t tell whether a document is genuine. Nobody is refused because of a check: a person decides.`,
  /** P36: a PPS number can stay; a plain suggestion to cover it. */
  pps: 'You can leave your PPS number showing. If you’d rather, cover it with a strip of paper before you take the photo, or black it out in the file.',
  fileLabel: 'Document',
  fileHint: 'A PDF, JPG or PNG, up to 10 MB. On a phone you can take a photo of a paper one.',
  kindLabel: 'What is it?',
  add: 'Add this document',
  adding: 'Reading it…',
  another: 'Add another document',
  added: 'Your documents',
  none: 'Nothing added yet.',
  full: 'That’s ten documents, as many as one application takes. Remove one to add another.',
  problems: {
    not_a_document: 'That file isn’t a PDF, JPG or PNG. Try a different file.',
    too_big: 'That file is over 10 MB. Try a smaller copy, or a photo.',
    too_many_pages: 'That PDF has more than 10 pages. Add only the pages that show your pay.',
    empty: 'That file is empty. Try choosing it again.',
    kind: 'Choose what kind of document it is.',
    full: 'That’s ten documents, as many as one application takes.',
    closed: 'Documents can’t be added from this link now.',
    link: 'This link has ended. Open the latest email from us.',
    failed: 'That didn’t upload. Check your connection and try again.',
  } as Record<string, string>,
  /** P38: what to fix, at once, in `warning`. Never a refusal: they can share anyway. */
  flags: {
    kind_differs: (kind: string) =>
      `This doesn’t look like a ${kind.toLowerCase()}. Check you chose the right kind, or add the document that’s asked for.`,
    name_differs: (name: string, onId: boolean) =>
      `The name on it isn’t ${name}, the name on your ${onId ? 'ID' : 'application'}. If it’s yours, you can still share it, and say why to the letting agent.`,
    out_of_date: (kind: DocumentKind) =>
      kind === 'payslip'
        ? 'Your latest payslip should be from the last six weeks. Add a newer one if you have it.'
        : kind === 'revenue_statement'
          ? 'This should be for one of the last two tax years. Add a newer one if you have it.'
          : 'This should be dated in the last three months. Add a newer one if you have it.',
    not_read_work: (operator: string) =>
      `We couldn’t read this one, so a person at ${operator} will look at it. You can enter what it says yourself.`,
    not_read_other:
      'We couldn’t read this one. Enter the amount and how often it’s paid, so it can be shared.',
  },
  /** P5: the reader is off or the month's budget is spent. */
  readerOff: (operator: string) =>
    `Gaff can’t read documents just now. A person at ${operator} will look at your documents.`,
  readByGaff: 'Read by AI',
  toCheck: 'To check',
  enteredByYou: 'Entered by you',
  changedByYou: 'Changed by you',
  fromProfile: 'From your profile',
  check: 'Check what was read',
  enter: 'Enter what it says',
  remove: 'Remove',
  removing: 'Removing…',
  toShare: 'Check and share',
  stillAsked:
    'Not everything asked for is here yet. You can share what you have, or add more first.',
  /** P39: the one step that shares everything, showing exactly what will be shared. */
  share: {
    title: (operator: string) => `Share with ${operator}`,
    lead: (operator: string) => `This is what ${operator} will see.`,
    identity: 'Your ID check',
    identityDone: (name: string, on: string) =>
      `Verified, in the name ${name}, on ${on}. They have this already.`,
    identityNot: 'Not done yet.',
    documents: 'Your documents',
    canOpen: (operator: string) => `${operator} can open this document.`,
    regular: (operator: string) =>
      `${operator} sees only the amount, how often it’s paid and the date, as regular income. They never see the statement, and it’s deleted now.`,
    referees: 'Your referees',
    refereeLine: (who: 'landlord' | 'employer', name: string, email: string) =>
      `${who === 'landlord' ? 'Your last landlord' : 'Your employer'}, ${name} (${email}). We’ll email them a short form now.`,
    noReferees: 'No referees.',
    keep: 'Keep these documents for my next application',
    keepHint:
      'They stay on your Gaff profile until they go out of date: payslips and letters three months after their date, Revenue notices after twelve. Statements of other income are never kept.',
    button: (operator: string) => `Share with ${operator}`,
    sharing: 'Sharing…',
    back: 'Back to my documents',
    next: (operator: string) =>
      `${operator} reads what you share and decides who to offer the home to. We’ll email you either way.`,
    nothing: 'Add a document first.',
  },
  /** The change screen (P39, P5). */
  change: {
    title: 'Check what was read',
    titleEnter: 'Enter what it says',
    lead: 'Change anything that isn’t right. Leave out any PPS number or bank details.',
    name: 'Name on it',
    date: 'Date on it',
    dateHint: 'For example, 2026-10-31',
    employer: 'Employer',
    amount: (kind: DocumentKind) =>
      kind === 'payslip'
        ? 'Take-home pay'
        : kind === 'revenue_statement' || kind === 'accountant_letter'
          ? 'Income for the year'
          : kind === 'other_income'
            ? 'Amount, or the balance'
            : 'Pay',
    period: 'How often',
    choose: 'Choose',
    periods: {
      weekly: 'Every week',
      fortnightly: 'Every two weeks',
      four_weekly: 'Every four weeks',
      monthly: 'Every month',
      yearly: 'Every year',
      balance: 'It’s a savings balance',
    } satisfies Record<AmountPeriod, string>,
    taxYear: 'Tax year',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Back',
    after: (operator: string) => `${operator} will see that you changed it.`,
    problems: {
      name_missing: 'Enter the name on the document.',
      number_kept_out: 'Leave out any PPS number or account number.',
      date: 'Enter a date that has passed, like 2026-10-31.',
      amount: 'Enter an amount, like 1,480.',
      period: 'Choose how often it’s paid.',
      tax_year: 'Enter a tax year from the last six years, like 2025.',
    } as Record<string, string>,
  },
} as const;

/** P47: wherever a letter sees income. Fixed wording. */
export const P47_REMINDER =
  'The decision is yours, and the same standard applies to everyone. Refusing someone because they get HAP, rent supplement or any other social welfare payment is against the law.';

/** P38: what Gaff checked, and what it can't. */
export const WHAT_GAFF_CHECKED =
  'Gaff checked that each document is the kind asked for, recent, and in the name on their ID. It can’t tell whether a document is genuine.';

/** The letter's page for one chosen renter (P44 to P48). */
export const letterDocumentsCopy = {
  metaTitle: 'Checks for a chosen renter',
  title: (name: string) => `${name}’s checks`,
  lead: 'What they shared, in words. Nothing here is a score: you decide.',
  notShared: (first: string) =>
    `${first} hasn’t shared their documents yet. We’ll show them here when they do.`,
  identity: 'ID',
  identityDone: (name: string, on: string) => `Verified by Gaff, in the name ${name}, on ${on}.`,
  identityNot: 'Not done yet.',
  work: 'Work',
  workFromReference: (summary: string) => `From their employer: ${summary}`,
  workWaiting: (name: string) => `Waiting for ${name}’s answer.`,
  workNone: 'No employer to ask.',
  personalAddress: 'Gaff sent this reference to a personal email address, not a work one.',
  landlord: 'Previous landlord',
  household: 'Household income they gave',
  householdValue: (cents: number) => `${formatEuro(cents)} a month, after tax`,
  documents: 'What their documents show',
  kind: (kind: LetterKind) => letterKindNames[kind],
  shows: (kind: LetterKind, reading: ReadingWords) => readingInWords(kind, reading),
  /** P44: arithmetic on the figure printed, as "about", never an estimate or a ratio. */
  aboutAMonth: (reading: ReadingWords) => {
    if (reading.amountCents === null || reading.period === null) return null;
    if (reading.period === 'monthly' || reading.period === 'balance') return null;
    const month = aboutAMonth(reading.amountCents, reading.period);
    return month === null ? null : `About ${formatEuro(roundedToEuro(month))} a month.`;
  },
  readByGaff: 'Read by AI',
  enteredBy: (first: string) => `Entered by ${first}`,
  changedBy: (first: string) => `Changed by ${first}`,
  notRead: 'Gaff couldn’t read it. Open it to see what it says.',
  regularNotGiven: (first: string) => `${first} didn’t give an amount.`,
  open: 'Open',
  opened: 'Opens in a new tab. Each opening is recorded.',
  deleted: 'Deleted on schedule.',
  keptUntil: (date: string) => `You can open it until ${date}.`,
  regularNote:
    'Regular income is read by Gaff from a statement you never see, so nothing about what it is reaches you.',
  /** P46: each flag in `warning`, with a plain reason and what to do. */
  flags: {
    name_differs: (onDocument: string | null, verified: string | null, first: string) =>
      onDocument && verified
        ? `The name on it is ${onDocument}. Their ID says ${verified}. Check this with ${first}.`
        : `The name on it isn’t the name ${first} gave. Check this with ${first}.`,
    out_of_date: (kind: LetterKind, first: string) =>
      kind === 'payslip'
        ? `Their latest payslip is older than six weeks. Ask ${first} for a newer one.`
        : kind === 'revenue_statement'
          ? `It isn’t for one of the last two tax years. Ask ${first} for a newer one.`
          : `It’s older than three months. Ask ${first} for a newer one.`,
    kind_differs: (first: string) =>
      `It isn’t the kind of document asked for. Open it, or ask ${first} about it.`,
    not_read: (first: string) => `Gaff couldn’t read it. Open it, or ask ${first} about it.`,
  } satisfies Record<DocumentFlag, unknown>,
  askAbout: (first: string) => `Ask ${first} about this`,
  back: 'Back to the checks',
  seeDocuments: 'See what they shared',
} as const;
