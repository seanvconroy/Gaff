import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db, withOrg } from '@/db/client';
import { inboundEmails, organisations } from '@/db/schema';
import { daftEnquiry } from '../fixtures/emails';
import { createTestMember } from './helpers';

// This file runs with Resend as the email provider.
const secretBytes = Buffer.alloc(24, 5);
process.env.EMAIL_PROVIDER = 'resend';
process.env.RESEND_API_KEY = 're_test_key';
process.env.RESEND_WEBHOOK_SECRET = `whsec_${secretBytes.toString('base64')}`;

function signedWebhook(event: unknown, secret = secretBytes): Request {
  const body = JSON.stringify(event);
  const id = `msg_${crypto.randomUUID()}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secret)
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');
  return new Request('http://localhost/api/inbound/resend', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': `v1,${signature}`,
    },
    body,
  });
}

async function gaffAddressOf(organisationId: string) {
  const [org] = await db()
    .select({ slug: organisations.inboundSlug })
    .from(organisations)
    .where(eq(organisations.id, organisationId));
  return `${org!.slug}@in.gaff.test`;
}

describe('R5 (ADR-0014): receiving enquiries through Resend', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('R5: stores a signed, forwarded enquiry for the right organisation', async () => {
    const member = await createTestMember();
    const emailId = `em_${crypto.randomUUID()}`;
    const fetchMock = vi.fn(async () =>
      Response.json({
        object: 'email',
        id: emailId,
        from: daftEnquiry.from,
        to: ['lettings@halcyon.example.ie'],
        received_for: [await gaffAddressOf(member.organisationId)],
        reply_to: [daftEnquiry.replyTo],
        subject: daftEnquiry.subject,
        text: daftEnquiry.text,
        html: null,
        headers: {},
        message_id: `<${emailId}@daft.ie>`,
        created_at: new Date().toISOString(),
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('@/app/api/inbound/resend/route');

    const response = await POST(
      signedWebhook({ type: 'email.received', data: { email_id: emailId } }),
    );
    expect(await response.json()).toEqual({ ok: true, result: 'stored' });
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.resend.com/emails/receiving/${emailId}`,
      expect.objectContaining({ headers: { authorization: 'Bearer re_test_key' } }),
    );
    const stored = await withOrg(member.organisationId, (tx) => tx.select().from(inboundEmails));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      provider: 'resend',
      subject: daftEnquiry.subject,
      replyTo: daftEnquiry.replyTo,
      status: 'received',
    });
  });

  it('R5: refuses an unsigned or wrongly signed request, without fetching anything', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('@/app/api/inbound/resend/route');
    const event = { type: 'email.received', data: { email_id: 'em_x' } };

    expect((await POST(signedWebhook(event, Buffer.alloc(24, 1)))).status).toBe(401);
    const unsigned = new Request('http://localhost/api/inbound/resend', {
      method: 'POST',
      body: JSON.stringify(event),
    });
    expect((await POST(unsigned)).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('R5: answers other events without retrying them', async () => {
    const { POST } = await import('@/app/api/inbound/resend/route');
    const response = await POST(
      signedWebhook({ type: 'email.delivered', data: { email_id: 'x' } }),
    );
    expect(await response.json()).toEqual({ ok: true, result: 'ignored' });
  });
});
