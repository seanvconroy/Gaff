import { describe, expect, it } from 'vitest';
import { checkDocumentReading } from '@/domain/documents/reading';
import {
  injectedPayslipPdf,
  otherIncomeStatementPdf,
  payslipPdf,
  savingsStatementPdf,
  utilityBillPdf,
} from '../../../tests/fixtures/documents';
import { fakeAi } from './fake';
import { pdfTextLines } from './fake-document';

const TODAY = '2026-11-20';

async function read(bytes: Buffer, saidKind: 'payslip' | 'other_income' = 'payslip') {
  const reply = await fakeAi.readDocument({
    file: { mediaType: 'application/pdf', base64: bytes.toString('base64') },
    saidKind,
    today: TODAY,
  });
  return checkDocumentReading(reply.output, TODAY);
}

describe('BA-16: the stand-in reads the made-up documents', () => {
  it('P37: reads a payslip’s kind, name, date, employer and take-home pay, and no PPS number', async () => {
    const pdf = payslipPdf({
      name: 'Niamh Kelly',
      date: '2026-10-31',
      netCents: 148_000,
      pps: '1234567T',
    });
    expect(pdfTextLines(pdf)).toContain('Net pay: €1480.00');
    expect(await read(pdf)).toEqual({
      kind: 'payslip',
      name: 'Niamh Kelly',
      date: '2026-10-31',
      employer: 'Acme Ltd',
      amountCents: 148_000,
      period: 'fortnightly',
      taxYear: null,
    });
  });

  it('P33, rule 3: reads other income’s amount and how often, never its payer or purpose', async () => {
    const reading = await read(
      otherIncomeStatementPdf({ name: 'Aoife Byrne', date: '2026-11-01', amountCents: 27_730 }),
      'other_income',
    );
    expect(reading).toMatchObject({
      kind: 'other_income',
      employer: null,
      amountCents: 27_730,
      period: 'weekly',
    });
    expect(JSON.stringify(reading)).not.toMatch(/Department|Pension/);
  });

  it('P33: reads a savings statement as a balance', async () => {
    expect(
      await read(
        savingsStatementPdf({ name: 'Aoife Byrne', date: '2026-11-01', balanceCents: 1_250_000 }),
        'other_income',
      ),
    ).toMatchObject({ kind: 'other_income', amountCents: 1_250_000, period: 'balance' });
  });

  it('knows what isn’t a document asked for, and ignores an instruction on the page', async () => {
    expect(await read(utilityBillPdf({ name: 'Niamh Kelly', date: '2026-11-01' }))).toMatchObject({
      kind: 'not_recognised',
    });
    const injected = await read(injectedPayslipPdf({ name: 'Niamh Kelly', date: '2026-10-31' }));
    expect(injected).toMatchObject({ name: 'Niamh Kelly', amountCents: 148_000 });
  });

  it('can’t read a photo, so the renter enters what it says', async () => {
    const reply = await fakeAi.readDocument({
      file: { mediaType: 'image/jpeg', base64: '/9j/' },
      saidKind: 'payslip',
      today: TODAY,
    });
    expect(reply.output).toMatchObject({ kind: 'not_recognised' });
  });
});
