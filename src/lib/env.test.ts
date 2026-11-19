import { describe, expect, it } from 'vitest';
import { environmentProblems, withPlatformDefaults } from './env';

const base = {
  DATABASE_URL: 'postgres://gaff:gaff@localhost:5432/gaff',
  APP_URL: 'https://app.gaff.example',
  AUTH_SECRET: 'x'.repeat(40),
};
const production = {
  ...base,
  GAFF_ENV: 'production',
  EMAIL_PROVIDER: 'mailgun',
  MAILGUN_API_KEY: 'k',
  MAILGUN_DOMAIN: 'mail.gaff.example',
  MAILGUN_WEBHOOK_SIGNING_KEY: 's',
  SMS_PROVIDER: 'sinch',
  SINCH_SERVICE_PLAN_ID: 'p',
  SINCH_API_TOKEN: 't',
  SINCH_FROM: 'Gaff',
  AI_PROVIDER: 'bedrock',
  IDENTITY_PROVIDER: 'none',
  INCOME_PROVIDER: 'none',
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  DEV_TOOLS: '0',
  CRON_SECRET: 'c'.repeat(32),
  PSRA_REGISTER_SOURCE: 'url',
  PSRA_REGISTER_URL: 'https://register.example/licensees.csv',
  ADDRESS_SEARCH: 'off',
  PHOTO_STORE: 'supabase',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'k',
};

describe('Production refuses anything that isn’t real (rules 7, 10; ADR-0005)', () => {
  it('starts with real providers, no stand-ins, and an encryption key', () => {
    expect(environmentProblems(production)).toEqual([]);
  });

  it('refuses stand-in ID or income checks, dev tools, or a missing key', () => {
    expect(environmentProblems({ ...production, IDENTITY_PROVIDER: 'stand_in' })).toEqual([
      'IDENTITY_PROVIDER',
    ]);
    expect(environmentProblems({ ...production, INCOME_PROVIDER: 'stand_in' })).toEqual([
      'INCOME_PROVIDER',
    ]);
    expect(environmentProblems({ ...production, DEV_TOOLS: '1' })).toEqual(['DEV_TOOLS']);
    expect(environmentProblems({ ...production, DATA_ENCRYPTION_KEY: undefined })).toEqual([
      'DATA_ENCRYPTION_KEY',
    ]);
  });

  it('UX-AG-1: refuses the made-up PSRA register, and needs the address of the real one', () => {
    expect(environmentProblems({ ...production, PSRA_REGISTER_SOURCE: 'sample' })).toEqual([
      'PSRA_REGISTER_SOURCE',
    ]);
    expect(environmentProblems({ ...production, PSRA_REGISTER_SOURCE: undefined })).toEqual([
      'PSRA_REGISTER_SOURCE',
    ]);
    expect(environmentProblems({ ...production, PSRA_REGISTER_URL: undefined })).toEqual([
      'PSRA_REGISTER_URL',
    ]);
    expect(environmentProblems({ ...production, PSRA_REGISTER_URL: 'not a web address' })).toEqual([
      'PSRA_REGISTER_URL',
    ]);
  });

  it('UX-AI-12: reading adverts is on unless it is switched off, and takes no other value', () => {
    expect(environmentProblems({ ...production, ADVERT_READER: 'off' })).toEqual([]);
    expect(environmentProblems({ ...production, ADVERT_READER: 'on' })).toEqual([]);
    expect(environmentProblems({ ...production, ADVERT_READER: 'fetch' })).toEqual([
      'ADVERT_READER',
    ]);
  });

  it('P1, P7: production refuses the Claude API and its key, and the stand-in AI: only Bedrock in the EU', () => {
    expect(environmentProblems({ ...production, AI_PROVIDER: 'fake' })).toEqual(['AI_PROVIDER']);
    expect(
      environmentProblems({ ...production, AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' }),
    ).toEqual(['AI_PROVIDER', 'ANTHROPIC_API_KEY']);
    expect(environmentProblems({ ...production, ANTHROPIC_API_KEY: 'k' })).toEqual([
      'ANTHROPIC_API_KEY',
    ]);
  });

  it('P1: the test copy and development may use the Claude API, with its key', () => {
    const staging = { ...base, GAFF_ENV: 'staging', CRON_SECRET: 'c'.repeat(32) };
    expect(
      environmentProblems({ ...staging, AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' }),
    ).toEqual([]);
    expect(environmentProblems({ ...base, AI_PROVIDER: 'anthropic' })).toEqual([
      'ANTHROPIC_API_KEY',
    ]);
  });

  it('P4, P8: a budget in dollars, never below nothing, and tasks switched off by name', () => {
    expect(environmentProblems({ ...production, AI_MONTHLY_BUDGET_USD: '250' })).toEqual([]);
    expect(environmentProblems({ ...production, AI_MONTHLY_BUDGET_USD: '-1' })).toEqual([
      'AI_MONTHLY_BUDGET_USD',
    ]);
    expect(environmentProblems({ ...production, AI_TASKS_OFF: 'advert, people' })).toEqual([]);
  });

  it('UX-LT-9, UX-LT-10: refuses the made-up address search and the local photo store', () => {
    expect(environmentProblems({ ...production, ADDRESS_SEARCH: 'sample' })).toEqual([
      'ADDRESS_SEARCH',
    ]);
    expect(environmentProblems({ ...production, ADDRESS_SEARCH: undefined })).toEqual([
      'ADDRESS_SEARCH',
    ]);
    expect(environmentProblems({ ...production, PHOTO_STORE: 'local' })).toEqual(['PHOTO_STORE']);
    expect(environmentProblems({ ...production, SUPABASE_SERVICE_ROLE_KEY: undefined })).toEqual([
      'SUPABASE_SERVICE_ROLE_KEY',
    ]);
    expect(environmentProblems({ ...production, SUPABASE_URL: 'not a web address' })).toEqual([
      'SUPABASE_URL',
    ]);
  });

  it('lets staging use the stand-ins and test tools, for testing with made-up details', () => {
    expect(
      environmentProblems({
        ...base,
        GAFF_ENV: 'staging',
        CRON_SECRET: 'c'.repeat(32),
        DEV_TOOLS: '1',
        IDENTITY_PROVIDER: 'stand_in',
        INCOME_PROVIDER: 'stand_in',
      }),
    ).toEqual([]);
  });
});

describe('Hosting on Vercel (ADR-0014)', () => {
  const vercel = {
    VERCEL: '1',
    VERCEL_ENV: 'production',
    VERCEL_PROJECT_PRODUCTION_URL: 'gaff-test.vercel.app',
    VERCEL_URL: 'gaff-test-abc123.vercel.app',
    VERCEL_BRANCH_URL: 'gaff-test-git-claude-gaff-mvp.vercel.app',
  };

  it('uses the production domain as the app address, unless APP_URL is set', () => {
    expect(withPlatformDefaults(vercel).APP_URL).toBe('https://gaff-test.vercel.app');
    expect(withPlatformDefaults({ ...vercel, APP_URL: 'https://app.gaff.ie' }).APP_URL).toBe(
      'https://app.gaff.ie',
    );
    expect(withPlatformDefaults({ ...vercel, VERCEL_ENV: 'preview' }).APP_URL).toBe(
      'https://gaff-test-git-claude-gaff-mvp.vercel.app',
    );
  });

  it('treats a deployment without GAFF_ENV as production, so stand-ins are refused', () => {
    const problems = environmentProblems({
      ...vercel,
      DATABASE_URL: base.DATABASE_URL,
      AUTH_SECRET: base.AUTH_SECRET,
    });
    expect(problems).toContain('CRON_SECRET');
    expect(problems).toContain('EMAIL_PROVIDER');
    expect(problems).toContain('DATA_ENCRYPTION_KEY');
  });

  it('needs only four settings for the test copy, with the test tools on', () => {
    const testCopy = {
      ...vercel,
      DATABASE_URL: base.DATABASE_URL,
      AUTH_SECRET: base.AUTH_SECRET,
      CRON_SECRET: 'c'.repeat(32),
      GAFF_ENV: 'staging',
    };
    expect(environmentProblems(testCopy)).toEqual([]);
    expect(environmentProblems({ ...testCopy, CRON_SECRET: undefined })).toEqual(['CRON_SECRET']);
  });

  it('needs the API key and webhook secret for Resend', () => {
    expect(
      environmentProblems({ ...production, EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_x' }),
    ).toEqual(['RESEND_WEBHOOK_SECRET']);
    expect(
      environmentProblems({
        ...production,
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 're_x',
        RESEND_WEBHOOK_SECRET: 'whsec_x',
      }),
    ).toEqual([]);
  });
});

describe('UX-TS-5: who Gaff’s own team is (STAFF_EMAILS)', () => {
  it('UX-ME-2: is empty by default, and takes email addresses separated by commas', () => {
    expect(environmentProblems(base)).toEqual([]);
    expect(
      environmentProblems({ ...base, STAFF_EMAILS: 'founder@gaff.test, second@gaff.test' }),
    ).toEqual([]);
    expect(environmentProblems({ ...base, STAFF_EMAILS: 'everyone' })).toEqual(['STAFF_EMAILS.0']);
  });
});

describe('UX-SI-1: Google and Apple are switched on by their credentials (Q30)', () => {
  it('needs neither: production starts without them, and the buttons aren’t shown', () => {
    expect(environmentProblems(production)).toEqual([]);
    expect(
      environmentProblems({ ...base, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' }),
    ).toEqual([]);
  });

  it('takes each provider’s two values together, or not at all', () => {
    const google = { GOOGLE_CLIENT_ID: 'id.apps.example', GOOGLE_CLIENT_SECRET: 's' };
    const apple = { APPLE_CLIENT_ID: 'ie.gaff.signin', APPLE_CLIENT_SECRET: 'signed.token' };
    expect(environmentProblems({ ...production, ...google, ...apple })).toEqual([]);
    expect(environmentProblems({ ...base, GOOGLE_CLIENT_ID: 'id.apps.example' })).toEqual([
      'GOOGLE_CLIENT_SECRET',
    ]);
    expect(environmentProblems({ ...base, APPLE_CLIENT_SECRET: 'signed.token' })).toEqual([
      'APPLE_CLIENT_ID',
    ]);
  });

  it('BA-8: takes Apple’s Services ID with the three values its secret is made from', () => {
    const made = {
      APPLE_CLIENT_ID: 'ie.gaff.signin',
      APPLE_TEAM_ID: 'TEAM123456',
      APPLE_KEY_ID: 'KEY1234567',
      APPLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----',
    };
    expect(environmentProblems({ ...production, ...made })).toEqual([]);
    expect(environmentProblems({ ...base, ...made, APPLE_KEY_ID: undefined })).toEqual([
      'APPLE_PRIVATE_KEY',
      'APPLE_CLIENT_SECRET',
    ]);
    expect(environmentProblems({ ...base, ...made, APPLE_CLIENT_ID: undefined })).toEqual([
      'APPLE_CLIENT_ID',
    ]);
  });
});
