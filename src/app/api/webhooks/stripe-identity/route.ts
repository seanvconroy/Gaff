import { verifyStripeSignature } from '@/adapters/identity/stripe';
import { env } from '@/lib/env';
import { handleIdentityEvent } from '@/server/identity/identity';

/** P54: Stripe Identity tells Gaff a person's check changed. Signed; anything else is refused. */
export async function POST(request: Request): Promise<Response> {
  const config = env();
  if (config.IDENTITY_PROVIDER !== 'stripe' || !config.STRIPE_IDENTITY_WEBHOOK_SECRET) {
    return new Response(null, { status: 404 });
  }
  const payload = await request.text();
  if (
    !verifyStripeSignature(
      payload,
      request.headers.get('stripe-signature'),
      config.STRIPE_IDENTITY_WEBHOOK_SECRET,
    )
  ) {
    return new Response(null, { status: 400 });
  }
  let event;
  try {
    event = JSON.parse(payload) as Parameters<typeof handleIdentityEvent>[0];
  } catch {
    return new Response(null, { status: 400 });
  }
  await handleIdentityEvent(event);
  return new Response(null, { status: 200 });
}
