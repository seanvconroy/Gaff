import { createPrivateKey, sign } from 'node:crypto';

/**
 * BA-8, AU1 (ADR-0019): Apple doesn't give a client secret to paste in. It's a short-lived token
 * (ES256) that Gaff signs with its Sign in with Apple key, good for at most six months. Making it
 * here, each time the sign-in set-up is built, means nobody has to renew one by hand, and
 * sign-in can't stop working because someone forgot.
 */

/** Apple's limit is six months; this is safely inside it. */
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

/** What Gaff's settings say about Sign in with Apple. */
export interface AppleSettings {
  APPLE_CLIENT_ID?: string | undefined;
  APPLE_CLIENT_SECRET?: string | undefined;
  APPLE_TEAM_ID?: string | undefined;
  APPLE_KEY_ID?: string | undefined;
  APPLE_PRIVATE_KEY?: string | undefined;
}

/** Whether Apple is set up: its Services ID, and a secret or what makes one. */
export function appleConfigured(config: AppleSettings): boolean {
  if (!config.APPLE_CLIENT_ID) return false;
  if (config.APPLE_CLIENT_SECRET) return true;
  return Boolean(config.APPLE_TEAM_ID && config.APPLE_KEY_ID && config.APPLE_PRIVATE_KEY);
}

/**
 * The client secret to give Apple: made here from the team ID, key ID and private key, so it
 * never lapses; or, where a static `APPLE_CLIENT_SECRET` is set, that one, as before.
 */
export function appleSecretFrom(config: AppleSettings, now = new Date()): string | null {
  if (!config.APPLE_CLIENT_ID) return null;
  if (config.APPLE_CLIENT_SECRET) return config.APPLE_CLIENT_SECRET;
  if (!config.APPLE_TEAM_ID || !config.APPLE_KEY_ID || !config.APPLE_PRIVATE_KEY) return null;
  return appleClientSecret({
    teamId: config.APPLE_TEAM_ID,
    clientId: config.APPLE_CLIENT_ID,
    keyId: config.APPLE_KEY_ID,
    privateKey: config.APPLE_PRIVATE_KEY,
    now,
  });
}
