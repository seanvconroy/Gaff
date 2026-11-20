import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  P47_REMINDER,
  WHAT_GAFF_CHECKED,
  letterDocumentsCopy,
  renterDocumentsCopy,
} from '@/copy/documents';
import { documentKinds, letterKinds, letterMayOpen } from '@/domain/documents/kinds';
import { checkDocumentReading, readingSchema } from '@/domain/documents/reading';
import { schema as modelSchema } from '@/adapters/ai/prompts/document';
import { eventCatalogue } from '@/server/record/events';

/**
 * BA-16 (P30 to P49; the live line's ADR-0026) against product rules 2, 3 and 8. Each guard is
 * held by the code's shape, not by care: a statement of other income has nowhere to go in an
 * operator's zone, no column can hold a PPS or account number, and nothing is asked of a
 * renter before they're chosen.
 */

function filesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesIn(path) : [path];
  });
}

const root = process.cwd();
const source = (file: string) => readFileSync(join(root, file), 'utf8');
const codeFiles = filesIn(join(root, 'src')).filter((file) => /\.(ts|tsx)$/.test(file));
const relative = (file: string) => file.slice(file.indexOf('src/'));
const using = (pattern: RegExp) =>
  codeFiles
    .filter((file) => !/\.test\.tsx?$/.test(file))
    .filter((file) => pattern.test(readFileSync(file, 'utf8')))
    .map(relative)
    .sort();

describe('Compliance, rule 3 (P33): a statement of other income never reaches an operator', () => {
  it('P33: the letter’s copy can’t name other income, and regular income can never hold a file', () => {
    expect(letterKinds as readonly string[]).not.toContain('other_income');
    expect(letterMayOpen('regular_income')).toBe(false);
    const schema = source('src/db/schema/documents.ts');
    expect(schema).toContain(
      "sql`${t.kind} <> 'regular_income' or (${t.storageKey} is null and ${t.contentType} is null)`",
    );
    const migrations = filesIn(join(root, 'drizzle'))
      .filter((file) => file.endsWith('.sql'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    expect(migrations).toContain('check_documents_regular_income_has_no_file');
  });

  it('rule 3: the renter’s own documents are in a zone no operator’s path sets', () => {
    const schema = source('src/db/schema/columns.ts');
    const policy = schema.slice(
      schema.indexOf('const applicantCheck'),
      schema.indexOf('export const applicantPolicy'),
    );
    expect(policy).toContain("current_setting('app.applicant_id', true)");
    expect(policy).not.toContain('app.org_id');
    // Only the renter's own request opens the zone, and withOrg() never does.
    expect(using(/scopeToApplicant\(/)).toEqual([
      'src/db/client.ts',
      'src/server/documents/renter.ts',
    ]);
    const client = source('src/db/client.ts');
    const withOrg = client.slice(
      client.indexOf('export function withOrg'),
      client.indexOf('export function withSystem'),
    );
    expect(withOrg).not.toContain('applicant_id');
  });

  it('rule 3: only the renter’s use cases, retention and their own profile touch their documents', () => {
    expect(using(/\brenterDocuments\b/)).toEqual([
      'src/db/schema/documents.ts',
      'src/server/accounts/delete-profile.ts',
      'src/server/documents/renter.ts',
      'src/server/documents/retention.ts',
    ]);
    // No workspace, task or owner page reaches the renter's own documents' use cases.
    const operatorPages = using(/^import (?!type )[^;]*'@\/server\/documents\/renter'/m).filter(
      (file) => !file.startsWith('src/app/r/'),
    );
    expect(operatorPages).toEqual([]);
  });

  it('P45: the only route that serves a document serves only what a letter may open', () => {
    const routes = using(/openSharedDocument|readFile\(/).filter((file) =>
      file.endsWith('route.ts'),
    );
    expect(routes).toEqual([
      'src/app/(workspace)/lettings/[lettingId]/documents/[documentId]/route.ts',
    ]);
    const letter = source('src/server/documents/letter.ts');
    const open = letter.slice(letter.indexOf('export async function openSharedDocument'));
    expect(open).toContain('!letterMayOpen(found.kind)');
  });

  it('rule 3: a reading has no field for a payer or what a payment is for', () => {
    const fields = Object.keys(readingSchema.shape);
    expect(fields).toEqual([
      'kind',
      'name',
      'date',
      'employer',
      'amountCents',
      'period',
      'taxYear',
    ]);
    expect(Object.keys(modelSchema.shape)).toEqual(fields);
    // The one text field a payer could go in is refused on other income.
    expect(
      checkDocumentReading(
        {
          kind: 'other_income',
          name: 'Aoife Byrne',
          date: '2026-11-01',
          employer: 'Department of Social Protection',
          amountCents: 27_730,
          period: 'weekly',
          taxYear: null,
        },
        '2026-11-20',
      ),
    ).toBeNull();
  });
});

describe('Compliance, rule 2 (Q50): no PPS number or account number is stored anywhere', () => {
  it('rule 2: no column in any table is for a PPS number, but the one for RTB registration', () => {
    const schemas = filesIn(join(root, 'src/db/schema')).map((file) => readFileSync(file, 'utf8'));
    const columns = schemas.flatMap((text) =>
      [...text.matchAll(/^\s+(\w+): (?:text|varchar|integer|bigint)\(/gm)].map((m) => m[1]!),
    );
    expect(columns.filter((name) => /pps/i.test(name))).toEqual(['ppsnSealed']);
    // The one account number is the letter's own, for the deposit to be paid into (rule 5).
    expect(
      columns.filter((name) => /iban|bic|sortCode|accountNumber|bankAccount/i.test(name)),
    ).toEqual(['paymentIban']);
    expect(source('src/db/schema/organisations.ts')).toContain('paymentIban: text()');
    // Neither document table has one, sealed or not.
    const documents = source('src/db/schema/documents.ts');
    expect(documents).not.toMatch(/(pps|iban|account|payer|benefit|welfare|pension)\w*:/i);
  });

  it('rule 2: any reading with a PPS or account number in it is refused, never cleaned', () => {
    const base = {
      kind: 'payslip' as const,
      date: '2026-10-31',
      employer: 'Acme Ltd',
      amountCents: 148_000,
      period: 'fortnightly' as const,
      taxYear: null,
    };
    for (const name of ['Niamh Kelly 1234567T', 'Niamh 1234567 TW', 'IE29AIBK93115212345678']) {
      expect(checkDocumentReading({ ...base, name }, '2026-11-20')).toBeNull();
    }
  });

  it('rule 8: no document event can hold a kind of document, an amount or any text', () => {
    for (const type of Object.keys(eventCatalogue).filter((t) => t.startsWith('document'))) {
      const shape = Object.keys(
        (eventCatalogue[type as keyof typeof eventCatalogue] as unknown as { shape: object }).shape,
      );
      expect(shape.some((key) => /kind|amount|name|employer|cents/i.test(key))).toBe(false);
    }
  });
});

describe('Compliance, rule 2 (DPC): documents are never asked for before someone is chosen', () => {
  it('rule 2: the documents step is drawn only inside a chosen renter’s checks', () => {
    expect(using(/<DocumentsTask\b|<ShareStep\b/)).toEqual(['src/app/r/[token]/Checks.tsx']);
    expect(using(/<DocumentUpload\b/)).toEqual(['src/app/r/[token]/Documents.tsx']);
  });

  it('rule 2: the server takes a document only for the preferred applicant or the backup', () => {
    const renter = source('src/server/documents/renter.ts');
    expect(renter).toContain("const CHOSEN = ['preferred', 'backup'] as const;");
    expect(renter).toContain('!(CHOSEN as readonly string[]).includes(application.status)');
  });

  it('P35, Q53: the kinds are a fixed list, with no bank statements, and nothing a letter adds', () => {
    expect([...documentKinds]).toEqual([
      'payslip',
      'contract',
      'employer_letter',
      'revenue_statement',
      'accountant_letter',
      'other_income',
    ]);
  });
});

describe('Compliance: the fixed words, for the solicitor (P38, P46, P47)', () => {
  it('P47: wherever a letter sees income, the decision is theirs and HAP is named', () => {
    expect(P47_REMINDER).toBe(
      'The decision is yours, and the same standard applies to everyone. Refusing someone because they get HAP, rent supplement or any other social welfare payment is against the law.',
    );
    const page = source('src/app/(task)/lettings/[lettingId]/checks/[applicationId]/page.tsx');
    expect(page).toContain('{P47_REMINDER}');
  });

  it('P38: Gaff says what it checked, and that it can’t tell a forgery', () => {
    expect(WHAT_GAFF_CHECKED).toBe(
      'Gaff checked that each document is the kind asked for, recent, and in the name on their ID. It can’t tell whether a document is genuine.',
    );
    expect(renterDocumentsCopy.more('Halcyon Lettings')).toContain(
      'Gaff can’t tell whether a document is genuine.',
    );
  });

  it('Voice: no exclamation marks, and never a score, a ratio or a pass', () => {
    // Every word, with made-up names and figures filled in.
    const said: string[] = [];
    const walk = (value: unknown): void => {
      if (typeof value === 'string') said.push(value);
      else if (typeof value === 'function') {
        const out = (value as (...args: unknown[]) => unknown)(
          'Halcyon Lettings',
          'Niamh Kelly',
          'Niamh',
        );
        if (typeof out === 'string') said.push(out);
      } else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    };
    walk({ renterDocumentsCopy, letterDocumentsCopy, P47_REMINDER, WHAT_GAFF_CHECKED });
    const words = said.join('\n');
    expect(said.length).toBeGreaterThan(60);
    expect(words).not.toContain('!');
    expect(words).not.toMatch(/times the rent|\bratio\b|\b(?:passes|fails|failed)\b|your rule/i);
  });
});
