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
  STORAGE_PROVIDER: 'supabase',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_KEY: 'service-key',
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
    expect(environmentProblems({ ...production, STORAGE_PROVIDER: 'local' })).toEqual([
      'STORAGE_PROVIDER',
    ]);
    expect(environmentProblems({ ...production, SUPABASE_SERVICE_KEY: undefined })).toEqual([
      'SUPABASE_SERVICE_KEY',
    ]);
    expect(environmentProblems({ ...production, DATA_ENCRYPTION_KEY: undefined })).toEqual([
      'DATA_ENCRYPTION_KEY',
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
