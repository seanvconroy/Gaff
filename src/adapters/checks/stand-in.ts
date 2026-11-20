import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * The stand-in ID and income checks (development and the test copy): a Gaff page where a tester
 * picks the result. The link the person is sent to carries a key made from the check's ID with
 * Gaff's secret, so on the test copy the person whose check it is can open that one page and
 * nothing else under /dev (BA-6, `standInCheckAccess`).
 */
function keyFor(checkId: string): string {
  return createHmac('sha256', env().AUTH_SECRET)
    .update(`stand-in-check:${checkId}`)
    .digest('base64url');
}

/** Whether a key is the one this check's link was given. */
export function standInKeyMatches(checkId: string, key: string | null | undefined): boolean {
  if (!key) return false;
  const expected = Buffer.from(keyFor(checkId));
  const given = Buffer.from(key);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The stand-in page for a check, with the way back and the check's own key. */
export function standInUrl(checkId: string, returnUrl: string): string {
  const url = new URL(`/dev/checks/${checkId}`, env().APP_URL);
  url.searchParams.set('return', returnUrl);
  url.searchParams.set('key', keyFor(checkId));
  return url.toString();
}
