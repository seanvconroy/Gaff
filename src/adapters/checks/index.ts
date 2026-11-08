import { env } from '@/lib/env';
import type { CheckProvider } from '@/ports/checks';

/**
 * Development and staging stand-in for the income check: a Gaff page where a tester picks the
 * result. Production refuses it (src/lib/env.ts) and uses "none", where the operator arranges
 * the check themselves, until work and income documents replace it (P30). Identity has its own
 * port and adapters (`src/ports/identity.ts`).
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

export function incomeProvider(): CheckProvider | null {
  return env().INCOME_PROVIDER === 'stand_in' ? standIn() : null;
}
