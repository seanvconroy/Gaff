import { describe, expect, it } from 'vitest';
import { environmentProblems } from './env';

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

  it('lets staging use the stand-ins and test tools, for testing with made-up details', () => {
    expect(
      environmentProblems({
        ...base,
        GAFF_ENV: 'staging',
        DEV_TOOLS: '1',
        IDENTITY_PROVIDER: 'stand_in',
        INCOME_PROVIDER: 'stand_in',
      }),
    ).toEqual([]);
  });
});
