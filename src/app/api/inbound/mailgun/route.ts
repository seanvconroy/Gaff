import { fromMailgunForm, verifyMailgunSignature } from '@/adapters/email/mailgun-inbound';
import { env } from '@/lib/env';
import { receiveInboundEmail } from '@/server/enquiries/receive';

export const dynamic = 'force-dynamic';

/**
 * R5: Mailgun (EU) forwards every email sent to a Gaff address here. We check the signature,
 * store the email and queue it; reading it happens in the worker (R6).
 * 406 tells Mailgun not to retry; any other failure makes it retry, so nothing is lost.
 */
export async function POST(request: Request): Promise<Response> {
  const config = env();
  if (config.EMAIL_PROVIDER !== 'mailgun' || !config.MAILGUN_WEBHOOK_SIGNING_KEY) {
    return new Response('Not configured', { status: 404 });
  }
  const form = await request.formData();
  const field = (name: string) => String(form.get(name) ?? '');
  const signed = verifyMailgunSignature(
    { timestamp: field('timestamp'), token: field('token'), signature: field('signature') },
    config.MAILGUN_WEBHOOK_SIGNING_KEY,
  );
  if (!signed) return new Response('Signature not valid', { status: 401 });

  const email = fromMailgunForm(form);
  if (!email) return new Response('Not an email', { status: 406 });
  const result = await receiveInboundEmail(email);
  if (result === 'unknown_recipient') return new Response('Unknown address', { status: 406 });
  return Response.json({ ok: true, result });
}
