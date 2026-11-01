import { z } from 'zod';

/**
 * R16, stage 5 (PRD workflow): people who came to view can apply. The application reuses
 * everything already given and asks only two things: how they mainly earn, and their
 * household's take-home income. Nothing here names or records a protected ground; housing
 * support such as HAP is counted as income, never asked about on its own (rule 3).
 */
export const earningLabels = {
  employed: 'From a job',
  self_employed: 'Self-employed',
  other: 'Something else',
} as const;

export type Earning = keyof typeof earningLabels;

const euro = /^€?\s*(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/;

export const applicationSchema = z
  .object({
    earning: z.enum(['employed', 'self_employed', 'other'], {
      error: 'Choose how you earn most of your income.',
    }),
    monthlyIncome: z
      .string()
      .trim()
      .refine((v) => euro.test(v), 'Enter your take-home income as an amount, like 3,200.')
      .transform((v) => Math.round(Number(v.replace(/[€,\s]/g, '')) * 100))
      .refine((cents) => cents > 0 && cents <= 100_000_000, {
        message: 'Enter your take-home income as an amount, like 3,200.',
      }),
  })
  .transform(({ earning, monthlyIncome }) => ({ earning, monthlyIncomeCents: monthlyIncome }));

export type Application = z.output<typeof applicationSchema>;

/**
 * The operator's income rule: take-home income at least this many tenths of the rent. Set by
 * the operator, the same for everyone, shown to renters before they apply (PRD fairness rules).
 * Default 2.5 times: a CTO default for the founders to confirm (PRD open decisions).
 */
export const DEFAULT_INCOME_RULE_TENTHS = 25;
export const incomeRuleChoices = [20, 25, 30] as const;

export function minimumIncomeCents(rentCents: number, ruleTenths: number): number {
  return Math.ceil((rentCents * ruleTenths) / 10);
}

/** How income compares with the rule. Never a refusal: a person decides (Principle 1). */
export function incomeAgainstRule(
  incomeCents: number,
  rentCents: number,
  ruleTenths: number,
): { ratioTenths: number; meetsRule: boolean } {
  return {
    ratioTenths: Math.floor((incomeCents * 10) / rentCents),
    meetsRule: incomeCents >= minimumIncomeCents(rentCents, ruleTenths),
  };
}

export function formatRatio(tenths: number): string {
  return `${Math.floor(tenths / 10)}${tenths % 10 === 0 ? '' : `.${tenths % 10}`}`;
}
