import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { daftEnquiry } from '../../../tests/fixtures/emails';
import { resendSender } from './resend';
import { fromResendEmail, htmlToText, verifyResendWebhook } from './resend-inbound';

const secretBytes = Buffer.alloc(24, 9);
const secret = `whsec_${secretBytes.toString('base64')}`;
const now = new Date('2026-11-04T18:00:00Z');
const timestamp = String(Math.floor(now.getTime() / 1000));
const body = JSON.stringify({ type: 'email.received', data: { email_id: 'em_1' } });
const sign = (content: string, key: Buffer = secretBytes) =>
  createHmac('sha256', key).update(content).digest('base64');

describe('R5 (ADR-0014): Resend webhooks are signed', () => {
  const headers = (signature: string, at = timestamp) => ({
    id: 'msg_1',
    timestamp: at,
    signature,
  });

  it('accepts a request signed with the webhook secret', () => {
    const signature = `v1,${sign(`msg_1.${timestamp}.${body}`)}`;
    expect(verifyResendWebhook(headers(signature), body, secret, now)).toBe(true);
  });

  it('accepts any one of several signatures, and ignores other versions', () => {
    const good = sign(`msg_1.${timestamp}.${body}`);
    expect(
      verifyResendWebhook(headers(`v2,${good} v1,bm9wZQ== v1,${good}`), body, secret, now),
    ).toBe(true);
    expect(verifyResendWebhook(headers(`v2,${good}`), body, secret, now)).toBe(false);
  });

  it('refuses a wrong secret, a changed body, a missing header or an old request', () => {
    const signature = `v1,${sign(`msg_1.${timestamp}.${body}`)}`;
    const other = `v1,${sign(`msg_1.${timestamp}.${body}`, Buffer.alloc(24, 1))}`;
    expect(verifyResendWebhook(headers(other), body, secret, now)).toBe(false);
    expect(verifyResendWebhook(headers(signature), `${body} `, secret, now)).toBe(false);
    expect(verifyResendWebhook({ ...headers(signature), id: null }, body, secret, now)).toBe(false);
    const later = new Date(now.getTime() + 6 * 60_000);
    expect(verifyResendWebhook(headers(signature), body, secret, later)).toBe(false);
  });
});

describe('R5 (ADR-0014): reading an email received by Resend', () => {
  const received = {
    id: 'em_1',
    from: daftEnquiry.from,
    // Forwarded by the agent's own mailbox: To is still the agent's address.
    to: ['Lettings <lettings@halcyon.example.ie>'],
    received_for: ['halcyon-lettings@in.gaff.test'],
    reply_to: [daftEnquiry.replyTo],
    subject: daftEnquiry.subject,
    text: daftEnquiry.text,
    message_id: '<abc@daft.ie>',
    created_at: '2026-11-04T17:59:00.000Z',
  };

  it('finds the Gaff address it was sent to, even when forwarded', () => {
    expect(fromResendEmail(received, 'in.gaff.test')).toEqual({
      provider: 'resend',
      providerMessageId: '<abc@daft.ie>',
      recipient: 'halcyon-lettings@in.gaff.test',
      from: daftEnquiry.from,
      replyTo: daftEnquiry.replyTo,
      subject: daftEnquiry.subject,
      text: daftEnquiry.text,
      receivedAt: new Date('2026-11-04T17:59:00.000Z'),
    });
  });

  it('reads a renter reply to a thread address from To', () => {
    const reply = {
      ...received,
      received_for: null,
      to: ['"Halcyon via Gaff" <Halcyon-Lettings+R7K2@in.gaff.test>'],
    };
    expect(fromResendEmail(reply, 'in.gaff.test')?.recipient).toBe(
      'halcyon-lettings+r7k2@in.gaff.test',
    );
  });

  it('uses the HTML when there is no plain text', () => {
    const htmlOnly = {
      ...received,
      text: null,
      html: '<style>p{}</style><p>Name: Aoife Byrne<br>Phone: 087&nbsp;123 4567</p><p>Is there parking?</p>',
    };
    expect(fromResendEmail(htmlOnly, 'in.gaff.test')?.text).toBe(
      'Name: Aoife Byrne\nPhone: 087 123 4567\n\nIs there parking?',
    );
    expect(htmlToText('<div>One &amp; two</div><div>three</div>')).toBe('One & two\nthree');
  });

  it('gives up on an email with no recipient at all', () => {
    expect(fromResendEmail({ ...received, to: [], received_for: [] }, 'in.gaff.test')).toBeNull();
  });
});

describe('ADR-0014: sending with Resend', () => {
  afterEach(() => vi.unstubAllGlobals());

  const email = {
    to: 'renter@example.ie',
    from: { name: 'Halcyon Lettings via Gaff', address: 'halcyon@mail.gaff.test' },
    replyTo: 'halcyon+r7@in.gaff.test',
    subject: '12 Ranelagh Road',
    text: 'Hello',
    idempotencyKey: 'message/1',
  };

  it('sends plain text with the reply-to address, once per message', async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: 'em_123' }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await resendSender({ apiKey: 're_test' }).send(email)).toEqual({
      providerMessageId: 'em_123',
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers).toMatchObject({
      authorization: 'Bearer re_test',
      'idempotency-key': 'message/1',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      from: '"Halcyon Lettings via Gaff" <halcyon@mail.gaff.test>',
      to: ['renter@example.ie'],
      subject: '12 Ranelagh Road',
      text: 'Hello',
      reply_to: 'halcyon+r7@in.gaff.test',
    });
  });

  it('fails with the error name only, never the address', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { name: 'validation_error', message: 'Invalid `to` field: renter@example.ie' },
          { status: 422 },
        ),
      ),
    );
    const failure = await resendSender({ apiKey: 're_test' })
      .send(email)
      .catch((error: Error) => error.message);
    expect(failure).toBe('Resend refused the message: 422 validation_error');
  });
});
