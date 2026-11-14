import { createPrivateKey, sign } from 'node:crypto';

/**
 * AU1 (ADR-0028): Apple doesn't give a client secret to paste in. It's a short-lived token
 * (ES256) that Gaff signs with its Sign in with Apple key, good for at most 6 months. Making it
 * here, each time the sign-in set-up is built, means nobody has to renew one by hand, and
 * sign-in can't stop working because someone forgot.
 */

/** Apple's limit is 6 months; this is safely inside it. */
export const APPLE_SECRET_DAYS = 150;

const b64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

/** A key pasted into a settings page often has its line breaks written as "\n". */
const asPem = (key: string) => key.replace(/\\n/g, '\n').trim();

export function appleClientSecret(input: {
  teamId: string;
  clientId: string;
  keyId: string;
  privateKey: string;
  now?: Date;
}): string {
  const issuedAt = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: input.keyId }));
  const claims = b64url(
    JSON.stringify({
      iss: input.teamId,
      iat: issuedAt,
      exp: issuedAt + APPLE_SECRET_DAYS * 24 * 60 * 60,
      aud: 'https://appleid.apple.com',
      sub: input.clientId,
    }),
  );
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), {
    key: createPrivateKey(asPem(input.privateKey)),
    // JWTs carry the raw r and s values, not the DER wrapping Node gives by default.
    dsaEncoding: 'ieee-p1363',
  });
  return `${header}.${claims}.${b64url(signature)}`;
}
