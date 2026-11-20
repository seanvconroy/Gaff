import { describe, expect, it } from 'vitest';
import { environmentProblems } from '@/lib/env';
import { senderAddress } from './index';

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
    const base = {
      DATABASE_URL: 'postgres://gaff:gaff@localhost:5432/gaff',
      APP_URL: 'https://app.gaff.example',
      AUTH_SECRET: 'x'.repeat(40),
    };
    expect(environmentProblems({ ...base, MAIL_FROM_ADDRESS: '' })).toEqual([]);
    expect(environmentProblems({ ...base, MAIL_FROM_ADDRESS: 'not-an-address' })).toEqual([
      'MAIL_FROM_ADDRESS',
    ]);
  });
});
