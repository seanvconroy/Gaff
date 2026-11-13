import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * M86: one-click links that stop alerts, from an email, without signing in. Signed with the
 * app's secret, so nothing needs storing: "s" stops one saved search, "a" stops every alert
 * of the renter who owns that search.
 */
export type StopScope = 's' | 'a';

function mac(scope: StopScope, searchId: string): string {
  return createHmac('sha256', env().AUTH_SECRET)
    .update(`alert-stop:${scope}:${searchId}`)
    .digest('base64url')
    .slice(0, 32);
}

export function stopToken(scope: StopScope, searchId: string): string {
  return `${scope}.${searchId}.${mac(scope, searchId)}`;
}

export function readStopToken(token: string): { scope: StopScope; searchId: string } | null {
  const match = /^([sa])\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{32})$/.exec(token);
  if (!match) return null;
  const [, scope, searchId, given] = match as unknown as [string, StopScope, string, string];
  const expected = Buffer.from(mac(scope, searchId));
  const actual = Buffer.from(given);
  return expected.length === actual.length && timingSafeEqual(expected, actual)
    ? { scope, searchId }
    : null;
}
