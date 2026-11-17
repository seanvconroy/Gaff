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

export const NAME_NEEDED = 'Enter your first and last name.';
export const EMAIL_NEEDED = 'Enter an email address, like name@example.ie.';
export const EMAIL_TAKEN =
  'That email is already used for this home. Use another, or keep the one you have.';

/**
 * UX-RN-11: the check screen shows the applicant's name and email, each with "Change". Either
 * may be left out, which keeps what Gaff has. Nothing else about the person can be sent here.
 */
export const applicantDetailsSchema = z.object({
  fullName: z
    .string()
    .trim()
    .max(120, NAME_NEEDED)
    .optional()
    .transform((value) => value || undefined)
    .refine((value) => value === undefined || value.length >= 2, NAME_NEEDED),
  email: z
    .string()
    .trim()
    .max(254, EMAIL_NEEDED)
    .optional()
    .transform((value) => value || undefined)
    .refine((value) => value === undefined || z.email().safeParse(value).success, EMAIL_NEEDED),
});

/** What's wrong with one screen of the application, by field. The page and the server share it. */
export function applicationProblems(
  values: Readonly<Record<string, string | undefined>>,
  fields: ReadonlyArray<'earning' | 'monthlyIncome' | 'fullName' | 'email'>,
): Record<string, string> {
  const problems: Record<string, string> = {};
  const issues = [
    ...(applicationSchema.safeParse(values).error?.issues ?? []),
    ...(applicantDetailsSchema.safeParse(values).error?.issues ?? []),
  ];
  for (const issue of issues) {
    const field = String(issue.path[0]);
    if ((fields as readonly string[]).includes(field)) problems[field] ??= issue.message;
  }
  if (fields.includes('fullName') && !problems.fullName && !values.fullName?.trim()) {
    problems.fullName = NAME_NEEDED;
  }
  if (fields.includes('email') && !problems.email && !values.email?.trim()) {
    problems.email = EMAIL_NEEDED;
  }
  return problems;
}

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
