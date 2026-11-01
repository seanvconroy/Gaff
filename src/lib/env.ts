import { z } from 'zod';

/**
 * Environment variables, validated on first use (not at import), so `next build`
 * works without production secrets. See .env.example for local values.
 */
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** Where this deployment runs. Production refuses stand-in providers and dev tools. */
    GAFF_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    DATABASE_URL: z.string().url(),
    APP_URL: z.string().url(),
    AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
    EMAIL_PROVIDER: z.enum(['dev', 'mailgun']).default('dev'),
    SMS_PROVIDER: z.enum(['fake', 'sinch']).default('fake'),
    AI_PROVIDER: z.enum(['fake', 'bedrock']).default('fake'),
    /**
     * R18: ID and income checks. "stand_in" is a development page where a tester picks the
     * result; "none" means no provider is connected yet, so the operator arranges the check.
     */
    IDENTITY_PROVIDER: z.enum(['none', 'stand_in']).default('stand_in'),
    INCOME_PROVIDER: z.enum(['none', 'stand_in']).default('stand_in'),
    /** ADR-0005: key for check results, encrypted in the application. 32 bytes, base64. */
    DATA_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, 'Must be 32 bytes, base64-encoded')
      .optional(),
    INBOUND_DOMAIN: z.string().min(3).default('in.gaff.test'),
    MAIL_FROM_DOMAIN: z.string().min(3).default('mail.gaff.test'),
    MAILGUN_API_KEY: z.string().optional(),
    MAILGUN_DOMAIN: z.string().optional(),
    MAILGUN_WEBHOOK_SIGNING_KEY: z.string().optional(),
    SINCH_SERVICE_PLAN_ID: z.string().optional(),
    SINCH_API_TOKEN: z.string().optional(),
    SINCH_FROM: z.string().optional(),
    AWS_REGION: z.string().default('eu-west-1'),
    BEDROCK_MODEL_ID: z.string().default('anthropic.claude-opus-5-5'),
    RETENTION_PERSONAL_DAYS: z.coerce.number().int().positive().default(30),
    RETENTION_RECORD_MONTHS: z.coerce.number().int().positive().default(12),
    DEV_TOOLS: z
      .enum(['0', '1'])
      .default('0')
      .transform((v) => v === '1'),
  })
  .superRefine((env, ctx) => {
    if (env.GAFF_ENV === 'production') {
      if (env.DEV_TOOLS) {
        ctx.addIssue({
          code: 'custom',
          path: ['DEV_TOOLS'],
          message: 'Dev tools must be off in production',
        });
      }
      const standIns = [
        ['EMAIL_PROVIDER', env.EMAIL_PROVIDER, 'dev'],
        ['SMS_PROVIDER', env.SMS_PROVIDER, 'fake'],
        ['AI_PROVIDER', env.AI_PROVIDER, 'fake'],
        ['IDENTITY_PROVIDER', env.IDENTITY_PROVIDER, 'stand_in'],
        ['INCOME_PROVIDER', env.INCOME_PROVIDER, 'stand_in'],
      ] as const;
      if (!env.DATA_ENCRYPTION_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['DATA_ENCRYPTION_KEY'],
          message: 'DATA_ENCRYPTION_KEY is required in production',
        });
      }
      for (const [key, value, standIn] of standIns) {
        if (value === standIn) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} can't be a stand-in in production`,
          });
        }
      }
    }
    if (env.EMAIL_PROVIDER === 'mailgun') {
      for (const key of [
        'MAILGUN_API_KEY',
        'MAILGUN_DOMAIN',
        'MAILGUN_WEBHOOK_SIGNING_KEY',
      ] as const) {
        if (!env[key])
          ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required for Mailgun` });
      }
    }
    if (env.SMS_PROVIDER === 'sinch') {
      for (const key of ['SINCH_SERVICE_PLAN_ID', 'SINCH_API_TOKEN', 'SINCH_FROM'] as const) {
        if (!env[key])
          ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required for Sinch` });
      }
    }
  });

export type Env = z.infer<typeof schema>;

/** For tests: what's wrong with an environment, if anything (paths of the problems). */
export function environmentProblems(source: Record<string, string | undefined>): string[] {
  const parsed = schema.safeParse(source);
  return parsed.success ? [] : parsed.error.issues.map((i) => i.path.join('.'));
}

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Environment is not configured correctly:\n${problems}`);
  }
  cached = parsed.data;
  return cached;
}
