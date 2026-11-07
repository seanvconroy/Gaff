import { env } from '@/lib/env';
import type { LetterIdentityProvider } from '@/ports/letter-identity';
import { stripeIdentity } from './stripe';

/**
 * Development and staging stand-in: a Gaff page where a tester picks the result, as for renters'
 * checks (R18). Production refuses it (src/lib/env.ts).
 */
function standIn(): LetterIdentityProvider {
  return {
    name: 'stand_in',
    async start({ checkId, organisationId, returnUrl }) {
      const url = new URL(`/dev/letter-identity/${organisationId}/${checkId}`, env().APP_URL);
      url.searchParams.set('return', returnUrl);
      return { providerRef: `stand-in-${checkId}`, redirectUrl: url.toString() };
    },
    async outcome() {
      return { status: 'pending' };
    },
    async redact() {},
  };
}

export function letterIdentityProvider(): LetterIdentityProvider {
  const config = env();
  return config.LETTER_IDENTITY_PROVIDER === 'stripe'
    ? stripeIdentity({ secretKey: config.STRIPE_SECRET_KEY! })
    : standIn();
}
