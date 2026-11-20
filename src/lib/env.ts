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
    /**
     * ADR-0017 (the live line's Q37): the Claude API on the test copy and in development, with
     * made-up data only; Claude on Bedrock in the EU in production; "fake" for tests.
     */
    AI_PROVIDER: z.enum(['fake', 'anthropic', 'bedrock']).default('fake'),
    /** The Claude API's key: the test copy and development only, never production. */
    ANTHROPIC_API_KEY: z.string().optional(),
    /** P2: one model for every task. Bedrock adds the "anthropic." prefix itself. */
    AI_MODEL: z.string().default('claude-opus-5-5'),
    /** P4: the month's AI spend, in US dollars as both providers bill it. Past it, people answer. */
    AI_MONTHLY_BUDGET_USD: z.coerce.number().min(0).default(100),
    /**
     * P8: tasks switched off without a deploy, such as "advert,people", or "all". A name that
     * isn't a task here (one of the live line's, say) switches nothing off.
     */
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
     * Q51 (ADR-0020): the ID check, a photo ID and a live selfie. "stripe" is Stripe Identity;
     * "stand_in" is a development page where a tester picks the result; "none" means no
     * provider, so the operator arranges the check. Production refuses the stand-in.
     */
    IDENTITY_PROVIDER: z.enum(['none', 'stand_in', 'stripe']).default('stand_in'),
    /** Stripe's secret key (sk_test_… on the test copy), and the identity webhook's secret. */
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_IDENTITY_WEBHOOK_SECRET: z.string().optional(),
    /** ADR-0005: key for check results, encrypted in the application. 32 bytes, base64. */
    DATA_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, 'Must be 32 bytes, base64-encoded')
      .optional(),
    INBOUND_DOMAIN: z.string().min(3).default('in.gaff.test'),
    MAIL_FROM_DOMAIN: z.string().min(3).default('mail.gaff.test'),
    /**
     * Interim: send every email from this one address instead of `<mailbox>@MAIL_FROM_DOMAIN`,
     * e.g. Resend's test sender `onboarding@resend.dev`. Display names and reply-to addresses
     * stay the same. The test copy only: production refuses it.
     */
    MAIL_FROM_ADDRESS: z
      .union([z.string().email(), z.literal('')])
      .optional()
      .transform((v) => v || undefined),
    /**
     * Resend (ADR-0014): sending, and the signing secret of the email.received webhook. Without
     * the secret, Gaff sends but doesn't receive: on the test copy, a send-only key is enough,
     * and each email that would invite a reply says to use its link instead. Production needs it.
     */
    RESEND_API_KEY: z.string().optional(),
    RESEND_WEBHOOK_SECRET: z.string().optional(),
    /**
     * The test copy only (GAFF_ENV=staging): real email goes to these people alone (addresses,
     * or "@domain" for a whole domain; "+tags" don't matter), and everyone else's to the outbox.
     * Unset, real email goes to everyone except made-up addresses (example.com, .test and the
     * like). Never in production.
     */
    TEST_EMAIL_RECIPIENTS: z.string().optional(),
    /**
     * The test copy only: the name the deployed test copy already uses for Gaff's own team. On
     * staging it is read as part of STAFF_EMAILS; anywhere else it is ignored, and production
     * refuses it.
     */
    TEST_STAFF_EMAILS: staffEmailsSchema,
    MAILGUN_API_KEY: z.string().optional(),
    MAILGUN_DOMAIN: z.string().optional(),
    MAILGUN_WEBHOOK_SIGNING_KEY: z.string().optional(),
    SINCH_SERVICE_PLAN_ID: z.string().optional(),
    SINCH_API_TOKEN: z.string().optional(),
    SINCH_FROM: z.string().optional(),
    /**
     * UX-SI-13 (ADR-0032): every sign-in text Gaff may send in an hour, to anyone. Past it,
     * sign-in by mobile asks for an email until the hour is out. 0 switches sign-in by mobile off.
     */
    SIGN_IN_TEXTS_PER_HOUR: z.coerce.number().int().min(0).default(300),
    /** Claude on Bedrock's region: Dublin (ADR-0009). */
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
    /**
     * Apple's Services ID, and what its client secret is made from (BA-8): the team ID, the
     * Sign in with Apple key's ID, and the key itself (the .p8 file's text). Gaff makes the
     * secret on the server, so it never lapses. A static APPLE_CLIENT_SECRET (a signed token
     * Apple accepts for six months) still works in their place.
     */
    APPLE_CLIENT_ID: z.string().optional(),
    APPLE_CLIENT_SECRET: z.string().optional(),
    APPLE_TEAM_ID: z.string().optional(),
    APPLE_KEY_ID: z.string().optional(),
    APPLE_PRIVATE_KEY: z.string().optional(),
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
     * UX-LT-1, UX-AI-12: reading a pasted advert into a letting. "on" reads with the AI provider
     * above, as its `advert` task. "off" offers only "Fill it in myself": the manual route never
     * needs the reader.
     */
    ADVERT_READER: z.enum(['on', 'off']).default('on'),
    /**
     * UX-LT-10: where homes' photos are kept. "local" is a table in Gaff's own database, for
     * local work and tests; "supabase" is Supabase Storage in Ireland (an approved vendor).
     */
    PHOTO_STORE: z.enum(['local', 'supabase']).default('local'),
    /**
     * UX-LS-11: whether search engines may index live homes' public pages. "off" (the default)
     * marks every page noindex, so a test or preview deployment is never found. Set "on" in
     * production only.
     */
    SEARCH_INDEXING: z.enum(['on', 'off']).default('off'),
    /**
     * BA-5 (the live line's ADR-0027, Q51 here): the map on search, and the lister's pin.
     * "google" is Google Maps (the Maps JavaScript API only, with a key restricted to Gaff's
     * addresses); "static" is the stand-in drawn from Gaff's own data, for tests, development and
     * a copy without a key; "none" is the list alone, and no pin to place (M135). Unset: the
     * stand-in everywhere but production, and in production the list alone until a key is set.
     */
    MAP_PROVIDER: z.enum(['google', 'static', 'none']).optional(),
    /** Public by design: Google restricts it to Gaff's addresses and the Maps JavaScript API. */
    GOOGLE_MAPS_API_KEY: z.string().optional(),
    GOOGLE_MAPS_MAP_ID: z.string().optional(),
    /** M130: a Map ID styled dark. Without one, the map and its pins stay light in both themes. */
    GOOGLE_MAPS_MAP_ID_DARK: z.string().optional(),
    /** Google's release channel for the Maps JavaScript API: quarterly changes least often. */
    GOOGLE_MAPS_VERSION: z.enum(['weekly', 'quarterly']).default('quarterly'),
    /** The Supabase project's address, and its service-role key, which stays on the server. */
    SUPABASE_URL: z.url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    /** The private bucket homes' photos go in. */
    PHOTO_BUCKET: z.string().min(1).default('homes'),
    /**
     * BA-16 (P53): where chosen renters' work and income documents are kept, encrypted with
     * DATA_ENCRYPTION_KEY on top of the store's own encryption. "local" is a table in Gaff's own
     * database, for local work and tests; "supabase" is a private bucket in Supabase Storage in
     * Ireland (an approved vendor). Production refuses "local".
     */
    DOCUMENT_STORE: z.enum(['local', 'supabase']).default('local'),
    /** The private bucket documents go in: never the photos' bucket, never public. */
    DOCUMENT_BUCKET: z.string().min(1).default('documents'),
  })
  .superRefine((env, ctx) => {
    if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: [env.GOOGLE_CLIENT_ID ? 'GOOGLE_CLIENT_SECRET' : 'GOOGLE_CLIENT_ID'],
        message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set together, or not at all',
      });
    }
    // BA-8: Apple's Services ID, with a static secret or the three things one is made from.
    const makers = [env.APPLE_TEAM_ID, env.APPLE_KEY_ID, env.APPLE_PRIVATE_KEY];
    const someMakers = makers.some(Boolean);
    const allMakers = makers.every(Boolean);
    if (someMakers && !allMakers) {
      ctx.addIssue({
        code: 'custom',
        path: ['APPLE_PRIVATE_KEY'],
        message:
          'APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY are set together, or not at all',
      });
    }
    const appleSecret = Boolean(env.APPLE_CLIENT_SECRET) || allMakers;
    if (Boolean(env.APPLE_CLIENT_ID) !== appleSecret) {
      ctx.addIssue({
        code: 'custom',
        path: [env.APPLE_CLIENT_ID ? 'APPLE_CLIENT_SECRET' : 'APPLE_CLIENT_ID'],
        message:
          'APPLE_CLIENT_ID is set with APPLE_CLIENT_SECRET, or with APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY, or not at all',
      });
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
        ['PSRA_REGISTER_SOURCE', env.PSRA_REGISTER_SOURCE, 'sample'],
        ['ADDRESS_SEARCH', env.ADDRESS_SEARCH, 'sample'],
        ['PHOTO_STORE', env.PHOTO_STORE, 'local'],
        ['DOCUMENT_STORE', env.DOCUMENT_STORE, 'local'],
      ] as const;
      if (!env.DATA_ENCRYPTION_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['DATA_ENCRYPTION_KEY'],
          message: 'DATA_ENCRYPTION_KEY is required in production',
        });
      }
      if (env.MAIL_FROM_ADDRESS) {
        ctx.addIssue({
          code: 'custom',
          path: ['MAIL_FROM_ADDRESS'],
          message: 'MAIL_FROM_ADDRESS is for the test copy only: verify a sending domain',
        });
      }
      if (env.TEST_EMAIL_RECIPIENTS) {
        ctx.addIssue({
          code: 'custom',
          path: ['TEST_EMAIL_RECIPIENTS'],
          message: 'TEST_EMAIL_RECIPIENTS is for the test copy only',
        });
      }
      if (env.TEST_STAFF_EMAILS.length > 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['TEST_STAFF_EMAILS'],
          message: 'TEST_STAFF_EMAILS is for the test copy only: use STAFF_EMAILS',
        });
      }
      // Real renters' data never goes to the Claude API (P7): production is Bedrock in the EU.
      if (env.AI_PROVIDER === 'anthropic') {
        ctx.addIssue({
          code: 'custom',
          path: ['AI_PROVIDER'],
          message: 'The Claude API is for the test copy only: production uses Bedrock in the EU',
        });
      }
      if (env.ANTHROPIC_API_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['ANTHROPIC_API_KEY'],
          message: 'ANTHROPIC_API_KEY is for the test copy and development only',
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
    if (env.IDENTITY_PROVIDER === 'stripe') {
      for (const key of ['STRIPE_SECRET_KEY', 'STRIPE_IDENTITY_WEBHOOK_SECRET'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required for Stripe Identity`,
          });
        }
      }
    }
    if (env.AI_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['ANTHROPIC_API_KEY'],
        message: 'ANTHROPIC_API_KEY is required for the Claude API',
      });
    }
    if (env.PSRA_REGISTER_SOURCE === 'url' && !env.PSRA_REGISTER_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['PSRA_REGISTER_URL'],
        message: 'PSRA_REGISTER_URL is required when PSRA_REGISTER_SOURCE is "url"',
      });
    }
    const onSupabase = (['PHOTO_STORE', 'DOCUMENT_STORE'] as const).filter(
      (store) => env[store] === 'supabase',
    );
    if (onSupabase.length > 0) {
      for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required when ${onSupabase.join(' or ')} is "supabase"`,
          });
        }
      }
    }
    if (env.DOCUMENT_STORE === 'supabase' && env.DOCUMENT_BUCKET === env.PHOTO_BUCKET) {
      ctx.addIssue({
        code: 'custom',
        path: ['DOCUMENT_BUCKET'],
        message: 'DOCUMENT_BUCKET must be its own private bucket, not the photos’ bucket',
      });
    }
    if (env.EMAIL_PROVIDER === 'resend') {
      // Production receives replies and forwarded enquiries, so it needs the webhook's secret.
      // The test copy can send with a send-only key and receive nothing (docs/deploy.md).
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
    if (env.GAFF_ENV === 'production' && env.MAP_PROVIDER === 'static') {
      ctx.addIssue({
        code: 'custom',
        path: ['MAP_PROVIDER'],
        message: "MAP_PROVIDER can't be the stand-in in production",
      });
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
    MAP_PROVIDER:
      env.MAP_PROVIDER ?? (env.GAFF_ENV === 'production' ? ('none' as const) : ('static' as const)),
    // The test copy: TEST_STAFF_EMAILS is the same list as STAFF_EMAILS, under the deployed
    // project's older name, so nobody has to enter it again. Nowhere else.
    STAFF_EMAILS:
      env.GAFF_ENV === 'staging'
        ? [...new Set([...env.STAFF_EMAILS, ...env.TEST_STAFF_EMAILS])]
        : env.STAFF_EMAILS,
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
    // M132: a preview copy shows the stand-in map. Its address isn't one Google's key allows,
    // and nobody's look at a preview should be billed as a map load.
    ...(source.VERCEL_ENV === 'preview' && source.MAP_PROVIDER === 'google'
      ? { MAP_PROVIDER: 'static' }
      : {}),
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
