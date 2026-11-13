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
    EMAIL_PROVIDER: z.enum(['dev', 'resend', 'mailgun']).default('dev'),
    SMS_PROVIDER: z.enum(['fake', 'sinch']).default('fake'),
    /**
     * Q37 (ADR-0025): the Claude API on the test copy and in development, with the founders'
     * credits and made-up data only; Claude on Bedrock in Dublin in production; "fake" for tests.
     */
    AI_PROVIDER: z.enum(['fake', 'anthropic', 'bedrock']).default('fake'),
    /** The Claude API's key: the test copy and development only, never production (Q37). */
    ANTHROPIC_API_KEY: z.string().optional(),
    /** P2: one model for every task. Bedrock adds the "anthropic." prefix itself. */
    AI_MODEL: z.string().default('claude-opus-5-5'),
    /** P4: the month's AI spend, in US dollars as both providers bill it. Past it, people answer. */
    AI_MONTHLY_BUDGET_USD: z.coerce.number().min(0).default(100),
    /** P8: tasks switched off without a deploy, such as "description,wording". */
    AI_TASKS_OFF: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    /**
     * Q48 (ADR-0026): everyone's identity, once per person: Stripe Identity, or a development
     * page where a tester picks the result. Production refuses the stand-in.
     */
    IDENTITY_PROVIDER: z.enum(['stand_in', 'stripe']).default('stand_in'),
    /** R18: the income check's stand-in, until work and income documents replace it (P30). */
    INCOME_PROVIDER: z.enum(['none', 'stand_in']).default('stand_in'),
    /** ADR-0005: key for check results, encrypted in the application. 32 bytes, base64. */
    DATA_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, 'Must be 32 bytes, base64-encoded')
      .optional(),
    INBOUND_DOMAIN: z.string().min(3).default('in.gaff.test'),
    MAIL_FROM_DOMAIN: z.string().min(3).default('mail.gaff.test'),
    /** M86: alerts' own sending subdomain, such as alerts.gaff.ie. Falls back to MAIL_FROM_DOMAIN. */
    ALERTS_MAIL_FROM_DOMAIN: z.string().min(3).optional(),
    /** M101: the Digital Services Act contact point for users and authorities. */
    CONTACT_EMAIL: z.email().optional(),
    /** M87: new homes within this many seconds go in one alert email (2 minutes; less in tests). */
    ALERT_GROUP_SECONDS: z.coerce.number().int().min(0).max(600).default(120),
    /**
     * Resend (ADR-0014): sending, and the signing secret of the email.received webhook. Without
     * the secret, Gaff sends but doesn't receive: replies by email and forwarded enquiries wait
     * until receiving is set up (the test copy, open question N2).
     */
    RESEND_API_KEY: z.string().optional(),
    RESEND_WEBHOOK_SECRET: z.string().optional(),
    /**
     * The test copy only: real email goes to these people alone (addresses, or "@domain" for a
     * whole domain; "+tags" don't matter), and everyone else's to the outbox. Unset, real email
     * goes to everyone except made-up addresses (example.com, .test and the like). Never in
     * production.
     */
    TEST_EMAIL_RECIPIENTS: z.string().optional(),
    /** The test copy only: these people are Gaff staff (admins) as soon as they sign in. */
    TEST_STAFF_EMAILS: z.string().optional(),
    MAILGUN_API_KEY: z.string().optional(),
    MAILGUN_DOMAIN: z.string().optional(),
    MAILGUN_WEBHOOK_SIGNING_KEY: z.string().optional(),
    SINCH_SERVICE_PLAN_ID: z.string().optional(),
    SINCH_API_TOKEN: z.string().optional(),
    SINCH_FROM: z.string().optional(),
    /** Claude on Bedrock's region: Dublin, in-region (Q37). */
    AWS_REGION: z.string().default('eu-west-1'),
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
    /**
     * ADR-0027: the map on search pages. "google" is Google Maps (the Maps JavaScript API only,
     * with a key restricted to Gaff's domains); "static" draws pins on a plain grid, for tests,
     * development and the test copy without a key; "none" shows the list alone. Production
     * needs "google".
     */
    MAP_PROVIDER: z.enum(['google', 'static', 'none']).optional(),
    GOOGLE_MAPS_API_KEY: z.string().optional(),
    GOOGLE_MAPS_MAP_ID: z.string().optional(),
    GOOGLE_MAPS_MAP_ID_DARK: z.string().optional(),
    /** Supabase's CA certificate (PEM), so the database's certificate is verified. */
    DATABASE_CA_CERT: z.string().optional(),
    /**
     * M43 (tech spec, decision 7): where listing photos live. "local" is files on disk, served by
     * /api/dev/storage, for development and tests; "database" keeps them in Postgres, for the
     * test copy, where functions have no disk; production uses Supabase Storage.
     */
    STORAGE_PROVIDER: z.enum(['local', 'database', 'supabase']).default('local'),
    LOCAL_STORAGE_DIR: z.string().optional(),
    SUPABASE_URL: z.string().url().optional(),
    /** Server only: signs uploads and writes photos. Never sent to a browser. */
    SUPABASE_SERVICE_KEY: z.string().optional(),
    STORAGE_UPLOADS_BUCKET: z.string().default('uploads'),
    STORAGE_MEDIA_BUCKET: z.string().default('listing-photos'),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_IDENTITY_WEBHOOK_SECRET: z.string().optional(),
    /**
     * The marketplace's public side (ADR-0015): renter sign-up, search and public pages. Off until
     * launch; on for the letter beta's invited organisations through their own flag.
     */
    MARKETPLACE_PUBLIC: z
      .enum(['0', '1'])
      .default('0')
      .transform((v) => v === '1'),
    /**
     * AU1, AU3 (ADR-0028): Sign in with Google. It shows once both are set. Without them, local
     * development and tests use a stand-in provider; the test copy and production show nothing.
     */
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    /**
     * Sign in with Apple: the Services ID, and what signs its client secret: the team, the key's
     * ID and the key itself (the .p8 file's text). All four, or none.
     */
    APPLE_CLIENT_ID: z.string().optional(),
    APPLE_TEAM_ID: z.string().optional(),
    APPLE_KEY_ID: z.string().optional(),
    APPLE_PRIVATE_KEY: z.string().optional(),
    /** AU6: the domain passkeys belong to: APP_URL's host (the default) or a parent of it. */
    PASSKEY_RP_ID: z.string().min(1).optional(),
    /**
     * AU12: refusing passwords seen in data breaches. "pwned_passwords" asks Have I Been Pwned
     * with 5 characters of a hash of the password, which identifies nobody; "stand_in" refuses a
     * short fixed list, for development and tests; "off" skips the check. Production chooses
     * one of the other two.
     */
    PASSWORD_BREACH_CHECK: z.enum(['pwned_passwords', 'stand_in', 'off']).default('stand_in'),
  })
  .superRefine((env, ctx) => {
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
        ['STORAGE_PROVIDER', env.STORAGE_PROVIDER, 'local'],
        ['STORAGE_PROVIDER', env.STORAGE_PROVIDER, 'database'],
        ['PASSWORD_BREACH_CHECK', env.PASSWORD_BREACH_CHECK, 'stand_in'],
      ] as const;
      if (!env.DATA_ENCRYPTION_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['DATA_ENCRYPTION_KEY'],
          message: 'DATA_ENCRYPTION_KEY is required in production',
        });
      }
      for (const key of ['TEST_EMAIL_RECIPIENTS', 'TEST_STAFF_EMAILS'] as const) {
        if (env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is for the test copy only`,
          });
        }
      }
      if (env.AI_PROVIDER === 'anthropic') {
        ctx.addIssue({
          code: 'custom',
          path: ['AI_PROVIDER'],
          message:
            'The Claude API is for the test copy only: production uses Bedrock in Dublin (Q37)',
        });
      }
      if (env.ANTHROPIC_API_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['ANTHROPIC_API_KEY'],
          message: 'ANTHROPIC_API_KEY is for the test copy and development only (Q37)',
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
    if (env.EMAIL_PROVIDER === 'resend') {
      // Production receives replies and forwarded enquiries, so it needs the webhook's secret.
      const keys =
        env.GAFF_ENV === 'production'
          ? (['RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET'] as const)
          : (['RESEND_API_KEY'] as const);
      for (const key of keys) {
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
    if (env.AI_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['ANTHROPIC_API_KEY'],
        message: 'ANTHROPIC_API_KEY is required for the Claude API',
      });
    }
    if (env.IDENTITY_PROVIDER === 'stripe') {
      for (const key of ['STRIPE_SECRET_KEY', 'STRIPE_IDENTITY_WEBHOOK_SECRET'] as const) {
        if (!env[key])
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required for Stripe Identity`,
          });
      }
    }
    if (env.STORAGE_PROVIDER === 'supabase') {
      for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'] as const) {
        if (!env[key])
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required for Supabase Storage`,
          });
      }
    }
    if (env.MAP_PROVIDER === 'google') {
      for (const key of ['GOOGLE_MAPS_API_KEY', 'GOOGLE_MAPS_MAP_ID'] as const) {
        if (!env[key])
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required for Google Maps`,
          });
      }
    }
    if (env.GAFF_ENV === 'production' && env.MARKETPLACE_PUBLIC && env.MAP_PROVIDER === 'static') {
      ctx.addIssue({
        code: 'custom',
        path: ['MAP_PROVIDER'],
        message: "MAP_PROVIDER can't be the static stand-in in production",
      });
    }
    // AU1 (ADR-0028): a provider is set up completely or not at all, so a missing variable is
    // caught here and not when someone presses the button.
    const providers = {
      Google: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
      Apple: ['APPLE_CLIENT_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY'],
    } as const;
    for (const [name, keys] of Object.entries(providers)) {
      if (!keys.some((key) => env[key])) continue;
      for (const key of keys) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required for Sign in with ${name}`,
          });
        }
      }
    }
    if (env.PASSKEY_RP_ID) {
      const host = URL.canParse(env.APP_URL) ? new URL(env.APP_URL).hostname : '';
      if (host !== env.PASSKEY_RP_ID && !host.endsWith(`.${env.PASSKEY_RP_ID}`)) {
        ctx.addIssue({
          code: 'custom',
          path: ['PASSKEY_RP_ID'],
          message: "PASSKEY_RP_ID must be APP_URL's host or a parent domain of it",
        });
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
    // Without a choice: the stand-in map everywhere but production (the test copy too, until
    // Google Maps is set up there), and in production the list alone until it is.
    MAP_PROVIDER:
      env.MAP_PROVIDER ?? (env.GAFF_ENV === 'production' ? ('none' as const) : ('static' as const)),
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

/** The settings these variables make, with the platform's defaults. Throws on a problem. */
export function readEnvironment(source: Source): Env {
  const parsed = schema.safeParse(withPlatformDefaults(source));
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Environment is not configured correctly:\n${problems}`);
  }
  return parsed.data;
}

let cached: Env | undefined;

export function env(): Env {
  cached ??= readEnvironment(process.env);
  return cached;
}

/** Tests that change a setting read the environment again, then put it back. */
export function resetEnvForTests(): void {
  cached = undefined;
}
