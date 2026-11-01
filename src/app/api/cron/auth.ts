import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

/** Compares secrets in constant time, whatever their lengths. */
function sameSecret(given: string, wanted: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(wanted));
}

/**
 * ADR-0014: only the schedulers may run jobs. They send CRON_SECRET as a bearer token. Returns
 * true, or the response to send instead.
 */
export function isCronRequest(request: Request): true | Response {
  const secret = env().CRON_SECRET;
  if (!secret) return new Response('Not configured', { status: 404 });
  const given = request.headers.get('authorization') ?? '';
  if (!sameSecret(given, `Bearer ${secret}`)) return new Response('Not allowed', { status: 401 });
  return true;
}
