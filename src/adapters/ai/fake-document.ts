import type { DocumentReadRequest } from '@/ports/ai';

/**
 * The stand-in's document reader (BA-16), for development and tests, with made-up documents
 * only (tests/fixtures/documents.ts). It reads the text lines of a plain PDF, as those fixtures
 * write them ("Employee: Niamh Kelly", "Net pay: EUR 1,480.00"), and returns the same fields the
 * model does. Like the model's, what it returns is trusted for nothing: `checkDocumentReading`
 * holds it to the rules. It can't read a photo, so a photo comes back unrecognised, and the
 * renter enters what it says.
 *
 * It maps only the labels it knows. A PPS number on the page has no label it reads, so it is
 * never in a reading, as with the model; the tests hold `checkDocumentReading` to refusing one
 * anyway.
 */

/** The text shown with `Tj` in a PDF's content streams, line by line. */
export function pdfTextLines(bytes: Buffer): string[] {
  const raw = bytes.toString('latin1');
  const lines: string[] = [];
  for (const found of raw.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) {
    lines.push(
      found[1]!
        .replace(/\\([0-7]{3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)))
        .replace(/\\(.)/g, '$1')
        // WinAnsi's euro sign.
        .replace(/\u0080/g, '€'),
    );
  }
  return lines;
}

const headings: Array<[RegExp, string]> = [
  [/^payslip|^pay slip|^payment advice/i, 'payslip'],
  [/^contract of employment|^offer of employment|^job offer/i, 'contract'],
  [/^confirmation of employment|^employment confirmation/i, 'employer_letter'],
  [/^notice of assessment|^statement of liability/i, 'revenue_statement'],
  [/^accountant/i, 'accountant_letter'],
  [/statement$|^savings/i, 'other_income'],
];

function field(lines: string[], labels: RegExp): string | null {
  for (const line of lines) {
    const found = /^([^:]+):\s*(.+)$/.exec(line);
    if (found && labels.test(found[1]!.trim())) return found[2]!.trim();
  }
  return null;
}

function cents(text: string | null): number | null {
  if (!text) return null;
  const number = /(\d+(?:,\d{3})*)(\.\d{1,2})?/.exec(text.replace(/\s/g, ''));
  return number
    ? Math.round(Number(`${number[1]!.replace(/,/g, '')}${number[2] ?? ''}`) * 100)
    : null;
}

function isoDate(text: string | null): string | null {
  if (!text) return null;
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return iso[0];
  const irish = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  return irish ? `${irish[3]}-${irish[2]!.padStart(2, '0')}-${irish[1]!.padStart(2, '0')}` : null;
}

const periods: Array<[RegExp, string]> = [
  [/four.?week/i, 'four_weekly'],
  [/fortnight|two weeks|bi-?weekly/i, 'fortnightly'],
  [/week/i, 'weekly'],
  [/month/i, 'monthly'],
  [/year|annual/i, 'yearly'],
];

export function readFixtureDocument(request: DocumentReadRequest): unknown {
  const empty = {
    kind: 'not_recognised',
    name: null,
    date: null,
    employer: null,
    amountCents: null,
    period: null,
    taxYear: null,
  };
  if (request.file.mediaType !== 'application/pdf') return empty;
  const lines = pdfTextLines(Buffer.from(request.file.base64, 'base64'));
  const kind = headings.find(([pattern]) => lines.some((line) => pattern.test(line)))?.[1];
  if (!kind) return empty;
  const balance = field(lines, /^balance$/i);
  const amount =
    balance ?? field(lines, /^(net pay|take-home pay|salary|pay|income|amount|payment)$/i);
  const frequency = field(lines, /^(pay frequency|frequency|paid|paid every)$/i);
  const year = field(lines, /^tax year$/i);
  return {
    kind,
    name: field(lines, /^(name|employee|employee name|customer|taxpayer|client)$/i),
    date: isoDate(field(lines, /^(date|pay date|statement date|date of issue|start date)$/i)),
    employer: kind === 'other_income' ? null : field(lines, /^(employer|company)$/i),
    amountCents: cents(amount),
    period: balance
      ? 'balance'
      : amount
        ? (periods.find(([pattern]) => pattern.test(frequency ?? ''))?.[1] ??
          (kind === 'revenue_statement' || kind === 'accountant_letter' ? 'yearly' : null))
        : null,
    taxYear: year ? Number(/\d{4}/.exec(year)?.[0] ?? 0) || null : null,
  };
}
