import { env } from '@/lib/env';
import type { CheckProvider } from '@/ports/checks';
import { standInUrl } from './stand-in';

/**
 * R18: the income check. Development and the test copy use a stand-in, a Gaff page where a
 * tester picks the result; production refuses it (src/lib/env.ts) and uses "none", so the
 * operator arranges this check themselves until work and income documents replace it (Q51).
 * The ID check has its own port and adapters (src/ports/identity.ts, src/adapters/identity).
 */
function standIn(): CheckProvider {
  return {
    async start({ checkId, returnUrl }) {
      return { providerRef: `stand-in-${checkId}`, redirectUrl: standInUrl(checkId, returnUrl) };
    },
  };
}

export function incomeProvider(): CheckProvider | null {
  return env().INCOME_PROVIDER === 'stand_in' ? standIn() : null;
}
