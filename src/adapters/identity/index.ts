import { env } from '@/lib/env';
import type { IdentityProvider } from '@/ports/identity';
import { standInUrl } from '../checks/stand-in';
import { stripeIdentity } from './stripe';

/**
 * Development and the test copy: a Gaff page where a tester picks the result, standing in for
 * Stripe Identity's own pages. The result comes back from that page, so there's nothing to read
 * and nothing held to delete. Production refuses it (src/lib/env.ts).
 */
function standIn(): IdentityProvider {
  return {
    name: 'stand_in',
    async start({ checkId, returnUrl }) {
      return { providerRef: `stand-in-${checkId}`, redirectUrl: standInUrl(checkId, returnUrl) };
    },
    async outcome() {
      return { status: 'pending' };
    },
    async redact() {},
  };
}

/**
 * Q51 (ADR-0018): the ID check's provider. "stripe" is Stripe Identity; "stand_in" the page
 * above; "none" means no provider, so the operator arranges the check themselves.
 */
export function identityProvider(): IdentityProvider | null {
  const config = env();
  if (config.IDENTITY_PROVIDER === 'stripe') {
    return stripeIdentity({ secretKey: config.STRIPE_SECRET_KEY! });
  }
  return config.IDENTITY_PROVIDER === 'stand_in' ? standIn() : null;
}
