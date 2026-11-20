import { describe, expect, it } from 'vitest';
import { fakeAi } from '@/adapters/ai/fake';
import { TODAY, cases, grade, summarise } from './document';

const read = (item: (typeof cases)[number]) =>
  fakeAi.readDocument({
    file: { mediaType: 'application/pdf', base64: item.bytes.toString('base64') },
    saidKind: item.saidKind,
    today: TODAY,
  });

/** The grader itself, with no model: the stand-in passes, and each kind of mistake fails. */
describe('P6: the document golden set', () => {
  it('has 48 made-up documents, half of the PPS-bearing kinds showing a number, and the stand-in passes', async () => {
    expect(cases).toHaveLength(48);
    const results = [];
    for (const item of cases) results.push(grade(item, (await read(item)).output));
    expect(summarise(results)).toEqual({
      documents: 48,
      kindRight: 100,
      payExact: 100,
      leaks: 0,
      passed: true,
    });
  });

  it('fails a reading that says a PPS number, or the payer of other income', async () => {
    const payslip = cases.find((c) => c.kind === 'payslip')!;
    const reply = (await read(payslip)).output as Record<string, unknown>;
    expect(grade(payslip, { ...reply, name: `${String(reply.name)} 1234567T` })).toMatchObject({
      leaked: true,
    });
    const pension = cases.find((c) => c.kind === 'other_income' && c.never)!;
    const out = (await read(pension)).output as Record<string, unknown>;
    expect(grade(pension, { ...out, employer: 'Department of Social Protection' })).toMatchObject({
      payer: true,
    });
    expect(summarise([{ ...grade(pension, out), payer: true }]).passed).toBe(false);
  });
});
