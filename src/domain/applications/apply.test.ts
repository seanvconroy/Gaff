import { describe, expect, it } from 'vitest';
import { findProtectedGrounds } from '@/domain/compliance/protected-grounds';
import {
  DEFAULT_INCOME_RULE_TENTHS,
  applicationSchema,
  earningLabels,
  incomeAgainstRule,
  minimumIncomeCents,
} from './apply';

describe('R16: applying, with self-declared employment and income only (stage 5)', () => {
  it('asks how someone mainly earns, in words that name no protected ground', () => {
    expect(Object.keys(earningLabels)).toEqual(['employed', 'self_employed', 'other']);
    for (const label of Object.values(earningLabels)) {
      expect(findProtectedGrounds(label)).toEqual([]);
    }
  });

  it('takes household take-home income in euro, stored in cents', () => {
    expect(applicationSchema.parse({ earning: 'employed', monthlyIncome: '4,250' })).toEqual({
      earning: 'employed',
      monthlyIncomeCents: 425_000,
    });
    expect(applicationSchema.parse({ earning: 'other', monthlyIncome: '€3100.50' })).toEqual({
      earning: 'other',
      monthlyIncomeCents: 310_050,
    });
  });

  it('explains what’s missing in plain words', () => {
    const result = applicationSchema.safeParse({ earning: '', monthlyIncome: 'lots' });
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((i) => i.message);
    expect(messages).toEqual([
      'Choose how you earn most of your income.',
      'Enter your take-home income as an amount, like 3,200.',
    ]);
  });

  it('accepts nothing else: no free text, no documents', () => {
    const parsed = applicationSchema.parse({
      earning: 'employed',
      monthlyIncome: '4000',
      employer: 'Acme',
      payslip: 'file',
    });
    expect(Object.keys(parsed).sort()).toEqual(['earning', 'monthlyIncomeCents']);
  });
});

describe('R16, R17: the income rule, the same for everyone and shown in advance', () => {
  it('defaults to a take-home income of 2.5 times the rent', () => {
    expect(DEFAULT_INCOME_RULE_TENTHS).toBe(25);
    expect(minimumIncomeCents(185_000, 25)).toBe(462_500);
  });

  it('compares income with the rule, as a ratio rounded down to one decimal place', () => {
    expect(incomeAgainstRule(500_000, 185_000, 25)).toEqual({ ratioTenths: 27, meetsRule: true });
    expect(incomeAgainstRule(462_500, 185_000, 25)).toEqual({ ratioTenths: 25, meetsRule: true });
    expect(incomeAgainstRule(400_000, 185_000, 25)).toEqual({ ratioTenths: 21, meetsRule: false });
  });
});
