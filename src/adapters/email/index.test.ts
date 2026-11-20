import { describe, expect, it } from 'vitest';
import { readEnvironment } from '@/lib/env';
import { receivesEmail, sendsRealEmail } from './index';

const staging = {
  DATABASE_URL: 'postgres://gaff:gaff@localhost:5432/gaff',
  APP_URL: 'https://gaff-test.example',
  AUTH_SECRET: 'x'.repeat(40),
  GAFF_ENV: 'staging',
  CRON_SECRET: 'c'.repeat(32),
};

describe('Test copy: whether mail is real, and whether replies come back', () => {
  it('keeps everything in the outbox with the development sender', () => {
    const config = readEnvironment(staging);
    expect(sendsRealEmail(config)).toBe(false);
    expect(receivesEmail(config)).toBe(false);
  });

  it('sends real email with a send-only Resend key, and receives nothing without the webhook', () => {
    const sending = { ...staging, EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_x' };
    expect(sendsRealEmail(readEnvironment(sending))).toBe(true);
    expect(receivesEmail(readEnvironment(sending))).toBe(false);
    // The webhook, but the inbound domain is still the made-up default: nothing arrives.
    expect(receivesEmail(readEnvironment({ ...sending, RESEND_WEBHOOK_SECRET: 'whsec_x' }))).toBe(
      false,
    );
    expect(
      receivesEmail(
        readEnvironment({
          ...sending,
          RESEND_WEBHOOK_SECRET: 'whsec_x',
          INBOUND_DOMAIN: 'in.gaff.ie',
        }),
      ),
    ).toBe(true);
  });
});
