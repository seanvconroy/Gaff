import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * A small value signed with a secret (HMAC-SHA256), with an expiry: readable by whoever holds
 * it, but not changeable. Used for the cookie that carries a sign-in step from one page to the
 * next (src/server/auth/pending.ts). Not for secrets: the value isn't encrypted.
 */

const mac = (payload: string, secret: string) =>
  createHmac('sha256', secret).update(payload).digest('base64url');

export function signValue(value: unknown, secret: string, expiresAt: Date): string {
  const payload = Buffer.from(JSON.stringify({ v: value, e: expiresAt.getTime() })).toString(
    'base64url',
  );
  return `${payload}.${mac(payload, secret)}`;
}

/** The value, if the signature is ours and it hasn't expired; null otherwise. */
export function openSigned<T = unknown>(
  token: string | undefined | null,
  secret: string,
  now = new Date(),
): T | null {
  const [payload, signature, ...rest] = (token ?? '').split('.');
  if (!payload || !signature || rest.length > 0) return null;
  const expected = Buffer.from(mac(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      v: T;
      e: number;
    };
    return typeof parsed.e === 'number' && parsed.e > now.getTime() ? parsed.v : null;
  } catch {
    return null;
  }
}
