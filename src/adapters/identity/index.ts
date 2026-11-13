import { env } from '@/lib/env';
import type { IdentityProvider } from '@/ports/identity';
import { stripeIdentity } from './stripe';

/**
 * Development and the test copy: a Gaff page where a tester picks the result, standing in for
 * Stripe Identity's own pages. Production refuses it (src/lib/env.ts).
 */
function standIn(): IdentityProvider {
  return {
    name: 'stand_in',
    async start({ checkId, selfie, returnUrl }) {
      const url = new URL(`/dev/identity/${checkId}`, env().APP_URL);
      url.searchParams.set('return', returnUrl);
      url.searchParams.set('selfie', selfie ? '1' : '0');
      return { providerRef: `stand-in-${checkId}`, redirectUrl: url.toString() };
    },
    async outcome() {
      return { status: 'pending' };
    },
    async redact() {},
  };
}

export function identityProvider(): IdentityProvider {
  const config = env();
  return config.IDENTITY_PROVIDER === 'stripe'
    ? stripeIdentity({ secretKey: config.STRIPE_SECRET_KEY! })
    : standIn();
}
