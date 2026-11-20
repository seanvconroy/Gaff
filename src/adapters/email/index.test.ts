import { describe, expect, it } from 'vitest';
import { environmentProblems, readEnvironment } from '@/lib/env';
import { receivesEmail, senderAddress, sendsRealEmail } from './index';

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

describe('Sender addresses', () => {
  it('send from the mailbox on the sending domain by default', () => {
    expect(senderAddress('halcyon', { MAIL_FROM_DOMAIN: 'mail.gaff.test' })).toBe(
      'halcyon@mail.gaff.test',
    );
  });

  it('send from one interim address when MAIL_FROM_ADDRESS is set', () => {
    const config = {
      MAIL_FROM_DOMAIN: 'mail.gaff.test',
      MAIL_FROM_ADDRESS: 'onboarding@resend.dev',
    };
    expect(senderAddress('halcyon', config)).toBe('onboarding@resend.dev');
    expect(senderAddress('no-reply', config)).toBe('onboarding@resend.dev');
  });

  it('accept an empty MAIL_FROM_ADDRESS and refuse one that isn’t an address', () => {
    expect(environmentProblems({ ...staging, MAIL_FROM_ADDRESS: '' })).toEqual([]);
    expect(environmentProblems({ ...staging, MAIL_FROM_ADDRESS: 'not-an-address' })).toEqual([
      'MAIL_FROM_ADDRESS',
    ]);
  });
});
