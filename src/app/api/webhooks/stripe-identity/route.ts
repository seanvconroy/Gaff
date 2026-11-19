import { verifyStripeSignature } from '@/adapters/identity/stripe';
import { env } from '@/lib/env';
import { handleIdentityEvent } from '@/server/identity/provider-results';

export const dynamic = 'force-dynamic';

/**
 * P54 (ADR-0018): Stripe Identity says a check's session changed. The signature is checked with
 * the endpoint's secret, and anything unsigned, or signed more than five minutes ago, is refused.
 * Even then nothing in the payload is believed: Gaff reads the session from Stripe itself and
 * records what Stripe says (src/server/identity/provider-results.ts). Any 2xx tells Stripe not
 * to send it again.
 */
export async function POST(request: Request): Promise<Response> {
  const config = env();
  if (config.IDENTITY_PROVIDER !== 'stripe' || !config.STRIPE_IDENTITY_WEBHOOK_SECRET) {
    return new Response('Not configured', { status: 404 });
  }
  const payload = await request.text();
  const signed = verifyStripeSignature(
    payload,
    request.headers.get('stripe-signature'),
    config.STRIPE_IDENTITY_WEBHOOK_SECRET,
  );
  if (!signed) return new Response('Signature not valid', { status: 400 });
  let event: unknown;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response('Not JSON', { status: 400 });
  }
  const result = await handleIdentityEvent(event);
  return Response.json({ ok: true, result });
}
