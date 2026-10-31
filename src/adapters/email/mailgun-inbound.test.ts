import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseGaffAddress } from '@/ports/inbound-email';
import { fromMailgunForm, verifyMailgunSignature } from './mailgun-inbound';

const key = 'test-signing-key';
const now = new Date('2026-10-31T12:00:00Z');
const timestamp = String(Math.floor(now.getTime() / 1000));
const sign = (ts: string, token: string) =>
  createHmac('sha256', key)
    .update(ts + token)
    .digest('hex');

describe('R5: receiving enquiries at a Gaff address', () => {
  it('accepts a correctly signed, fresh webhook', () => {
    const token = 'a'.repeat(50);
    expect(
      verifyMailgunSignature({ timestamp, token, signature: sign(timestamp, token) }, key, now),
    ).toBe(true);
  });

  it('refuses a wrong signature', () => {
    expect(
      verifyMailgunSignature(
        { timestamp, token: 't', signature: sign(timestamp, 'other') },
        key,
        now,
      ),
    ).toBe(false);
  });

  it('refuses a replayed webhook more than five minutes old', () => {
    const old = String(Number(timestamp) - 301);
    expect(
      verifyMailgunSignature({ timestamp: old, token: 't', signature: sign(old, 't') }, key, now),
    ).toBe(false);
  });

  it('reads Mailgun’s form post', () => {
    const form = new FormData();
    form.set('recipient', 'Halcyon-Lettings@in.gaff.test');
    form.set('from', 'Daft.ie <noreply@daft.ie>');
    form.set('subject', 'New enquiry');
    form.set('body-plain', 'Hello');
    form.set('timestamp', timestamp);
    form.set(
      'message-headers',
      JSON.stringify([
        ['Message-Id', '<abc@daft.ie>'],
        ['Reply-To', 'aoife@example.ie'],
      ]),
    );
    expect(fromMailgunForm(form)).toMatchObject({
      provider: 'mailgun',
      providerMessageId: '<abc@daft.ie>',
      recipient: 'halcyon-lettings@in.gaff.test',
      replyTo: 'aoife@example.ie',
      receivedAt: now,
    });
  });

  it('works out the organisation and the reply thread from the address', () => {
    expect(parseGaffAddress('halcyon-lettings@in.gaff.test', 'in.gaff.test')).toEqual({
      slug: 'halcyon-lettings',
      ref: null,
    });
    expect(parseGaffAddress('Halcyon-Lettings+R7K2@in.gaff.test', 'in.gaff.test')).toEqual({
      slug: 'halcyon-lettings',
      ref: 'r7k2',
    });
    expect(parseGaffAddress('halcyon@elsewhere.ie', 'in.gaff.test')).toBeNull();
  });
});
