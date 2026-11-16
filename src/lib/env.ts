import { z } from 'zod';
import { staffEmailsSchema } from '@/domain/staff/staff';

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
    EMAIL_PROVIDER: z.enum(['dev', 'resend', 'mailgun']).default('dev'),
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
    /** Resend (ADR-0014): sending, and the signing secret of the email.received webhook. */
    RESEND_API_KEY: z.string().optional(),
    RESEND_WEBHOOK_SECRET: z.string().optional(),
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
    /**
     * The outbox, test inbox, test check page and "start the viewings now". Off unless set to 1,
     * except on staging (the test copy), where it's on unless set to 0. Never in production.
     */
    DEV_TOOLS: z.enum(['0', '1']).optional(),
    /**
     * ADR-0014: run queued jobs straight after the request that queued them, so a reply goes out
     * in seconds. On by default on Vercel, where there's no long-running worker; off locally,
     * where `pnpm worker` runs them.
     */
    RUN_JOBS_AFTER_REQUESTS: z
      .enum(['0', '1'])
      .default('0')
      .transform((v) => v === '1'),
    /** ADR-0014: the minute tick (Supabase Cron) and Vercel Cron send it to /api/cron/tick. */
    CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 characters').optional(),
    /** Supabase's CA certificate (PEM), so the database's certificate is verified. */
    DATABASE_CA_CERT: z.string().optional(),
    /**
     * UX-TS-5: the emails of Gaff's own team, separated by commas. Only they can open the
     * internal pages (/internal). Empty by default: nobody is staff until this is set.
     */
    STAFF_EMAILS: staffEmailsSchema,
    /**
     * UX-SI-1 (Q30): "Continue with Google" and "Continue with Apple". Each is switched on by
     * setting both of its values. With neither, its button isn't shown; where the development
     * tools are on, a local stand-in takes its place (/dev/sign-in).
     */
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    /** Apple's Services ID, and the client secret (a signed token Apple accepts for six months). */
    APPLE_CLIENT_ID: z.string().optional(),
    APPLE_CLIENT_SECRET: z.string().optional(),
    /**
     * UX-AG-1 (Q39): where Gaff's weekly copy of the PSRA register comes from. "sample" is a
     * made-up register for local work and tests, never for production; "url" downloads the
     * register from PSRA_REGISTER_URL (docs/deploy.md, "The PSRA register").
     */
    PSRA_REGISTER_SOURCE: z.enum(['sample', 'url']).default('sample'),
    PSRA_REGISTER_URL: z.url().optional(),
    /**
     * UX-LT-9 (Q40): address search when adding a letting. "sample" is a made-up gazetteer for
     * local work and tests, never for production. "off" looks nothing up: the address is typed
     * into the manual fields. Autoaddress joins this list once its DPA is signed (rule 10).
     */
    ADDRESS_SEARCH: z.enum(['off', 'sample']).default('sample'),
    /**
     * UX-LT-10: where homes' photos are kept. "local" is a table in Gaff's own database, for
     * local work and tests; "supabase" is Supabase Storage in Ireland (an approved vendor).
     */
    PHOTO_STORE: z.enum(['local', 'supabase']).default('local'),
    /** The Supabase project's address, and its service-role key, which stays on the server. */
    SUPABASE_URL: z.url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    /** The private bucket homes' photos go in. */
    PHOTO_BUCKET: z.string().min(1).default('homes'),
  })
  .superRefine((env, ctx) => {
    for (const [id, secret] of [
      ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
      ['APPLE_CLIENT_ID', 'APPLE_CLIENT_SECRET'],
    ] as const) {
      if (Boolean(env[id]) !== Boolean(env[secret])) {
        ctx.addIssue({
          code: 'custom',
          path: [env[id] ? secret : id],
          message: `${id} and ${secret} are set together, or not at all`,
        });
      }
    }
    if (env.GAFF_ENV === 'production' || env.GAFF_ENV === 'staging') {
      if (!env.CRON_SECRET) {
        ctx.addIssue({
          code: 'custom',
          path: ['CRON_SECRET'],
          message: 'CRON_SECRET is required, or timed jobs never run',
        });
      }
    }
    if (env.GAFF_ENV === 'production') {
      if (env.DEV_TOOLS === '1') {
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
        ['PSRA_REGISTER_SOURCE', env.PSRA_REGISTER_SOURCE, 'sample'],
        ['ADDRESS_SEARCH', env.ADDRESS_SEARCH, 'sample'],
        ['PHOTO_STORE', env.PHOTO_STORE, 'local'],
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
    if (env.PSRA_REGISTER_SOURCE === 'url' && !env.PSRA_REGISTER_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['PSRA_REGISTER_URL'],
        message: 'PSRA_REGISTER_URL is required when PSRA_REGISTER_SOURCE is "url"',
      });
    }
    if (env.PHOTO_STORE === 'supabase') {
      for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required when PHOTO_STORE is "supabase"`,
          });
        }
      }
    }
    if (env.EMAIL_PROVIDER === 'resend') {
      for (const key of ['RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET'] as const) {
        if (!env[key])
          ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required for Resend` });
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
  })
  .transform((env) => ({
    ...env,
    DEV_TOOLS: env.DEV_TOOLS === undefined ? env.GAFF_ENV === 'staging' : env.DEV_TOOLS === '1',
  }));

export type Env = z.infer<typeof schema>;

type Source = Record<string, string | undefined>;

/**
 * ADR-0014: on Vercel, APP_URL defaults to the deployment's own address (the production domain
 * for production deployments), and GAFF_ENV defaults to production, the strictest setting, so a
 * deployment that forgets it refuses stand-ins rather than quietly using them.
 */
export function withPlatformDefaults(source: Source): Source {
  if (source.VERCEL !== '1') return source;
  const host =
    source.VERCEL_ENV === 'production'
      ? source.VERCEL_PROJECT_PRODUCTION_URL
      : (source.VERCEL_BRANCH_URL ?? source.VERCEL_URL);
  return {
    ...source,
    APP_URL: source.APP_URL || (host ? `https://${host}` : undefined),
    GAFF_ENV: source.GAFF_ENV || 'production',
    RUN_JOBS_AFTER_REQUESTS: source.RUN_JOBS_AFTER_REQUESTS || '1',
  };
}

/** What's wrong with an environment, if anything: the names of the problems, never values. */
export function environmentProblems(source: Source): string[] {
  const parsed = schema.safeParse(withPlatformDefaults(source));
  return parsed.success ? [] : parsed.error.issues.map((i) => i.path.join('.'));
}

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(withPlatformDefaults(process.env));
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Environment is not configured correctly:\n${problems}`);
  }
  cached = parsed.data;
  return cached;
}
