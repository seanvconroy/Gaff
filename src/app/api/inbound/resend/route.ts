import {
  emailReceivedEvent,
  fetchReceivedEmail,
  fromResendEmail,
  verifyResendWebhook,
} from '@/adapters/email/resend-inbound';
import { env } from '@/lib/env';
import { receiveInboundEmail } from '@/server/enquiries/receive';

export const dynamic = 'force-dynamic';

/**
 * R5 (ADR-0014): Resend calls this when an email arrives at a Gaff address. We check the
 * signature, fetch the email, store it and queue it; reading it happens in a job (R6).
 * Any 2xx tells Resend not to retry; any other answer makes it retry, so nothing is lost.
 */
export async function POST(request: Request): Promise<Response> {
  const config = env();
  if (config.EMAIL_PROVIDER !== 'resend' || !config.RESEND_WEBHOOK_SECRET) {
    return new Response('Not configured', { status: 404 });
  }
  const body = await request.text();
  const signed = verifyResendWebhook(
    {
      id: request.headers.get('svix-id'),
      timestamp: request.headers.get('svix-timestamp'),
      signature: request.headers.get('svix-signature'),
    },
    body,
    config.RESEND_WEBHOOK_SECRET,
  );
  if (!signed) return new Response('Signature not valid', { status: 401 });

  let event: unknown;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response('Not JSON', { status: 400 });
  }
  const received = emailReceivedEvent.safeParse(event);
  // Other events (sent, delivered, bounced) aren't used yet.
  if (!received.success) return Response.json({ ok: true, result: 'ignored' });

  const email = await fetchReceivedEmail(config.RESEND_API_KEY!, received.data.data.email_id);
  const inbound = fromResendEmail(email, config.INBOUND_DOMAIN);
  if (!inbound) return Response.json({ ok: true, result: 'no_recipient' });
  const result = await receiveInboundEmail(inbound);
  return Response.json({ ok: true, result });
}
