import { env } from '@/lib/env';
import type { CheckProvider } from '@/ports/checks';

/**
 * Development and staging stand-in: a Gaff page where a tester picks the result. Production
 * refuses it (src/lib/env.ts); until a real provider is approved and added, production uses
 * "none" and the operator arranges these checks themselves.
 */
function standIn(): CheckProvider {
  return {
    async start({ checkId, returnUrl }) {
      return {
        providerRef: `stand-in-${checkId}`,
        redirectUrl: `${env().APP_URL}/dev/checks/${checkId}?return=${encodeURIComponent(returnUrl)}`,
      };
    },
  };
}

export function identityProvider(): CheckProvider | null {
  return env().IDENTITY_PROVIDER === 'stand_in' ? standIn() : null;
}

export function incomeProvider(): CheckProvider | null {
  return env().INCOME_PROVIDER === 'stand_in' ? standIn() : null;
}
