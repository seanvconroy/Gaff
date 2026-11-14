import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';
import { auth } from '@/server/auth/auth';
import type { Jar } from './provider-helpers';

/**
 * A passkey kept in memory, for tests: what a phone, a security key or a password manager does
 * when a site asks for one. It makes a key pair for the site, hands over the public half, and
 * afterwards signs the site's challenge together with the address of the page that asked. That
 * last part is why a look-alike site can't use a passkey: the address is in what gets signed.
 */
export interface SoftwarePasskey {
  credentialId: Buffer;
  privateKey: KeyObject;
  publicKey: KeyObject;
  /** Kept in a password manager and on every device, like iCloud Keychain. */
  synced: boolean;
  /** The Gaff account it was made for, as the device remembers it. */
  userHandle: string;
}

export const APP_ORIGIN = new URL(process.env.APP_URL ?? 'http://localhost:3000').origin;
const RP_ID = new URL(APP_ORIGIN).hostname;

/** Apple's password manager's ID for itself, which is how a passkey gets its first name. */
export const APPLE_PASSWORDS = 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd';
const NO_NAME = '00000000-0000-0000-0000-000000000000';

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest();

// What the authenticator says about itself: someone was there, and it checked it was them.
const USER_PRESENT = 0x01;
const USER_VERIFIED = 0x04;
const BACKUP_ELIGIBLE = 0x08;
const BACKED_UP = 0x10;
const HAS_CREDENTIAL = 0x40;

/** The public key as the WebAuthn standard writes it (a COSE key, in CBOR): P-256, ES256. */
function coseKey(publicKey: KeyObject): Buffer {
  const jwk = publicKey.export({ format: 'jwk' });
  return Buffer.concat([
    Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
    Buffer.from(jwk.x!, 'base64url'),
    Buffer.from([0x22, 0x58, 0x20]),
    Buffer.from(jwk.y!, 'base64url'),
  ]);
}

function authenticatorData(key: SoftwarePasskey, rpId: string, madeBy?: string): Buffer {
  let flags = USER_PRESENT | USER_VERIFIED;
  if (key.synced) flags |= BACKUP_ELIGIBLE | BACKED_UP;
  if (madeBy) flags |= HAS_CREDENTIAL;
  // Synced passkeys don't count their uses: the counter stays at 0.
  const head = Buffer.concat([sha256(rpId), Buffer.from([flags]), Buffer.alloc(4)]);
  if (!madeBy) return head;
  const length = Buffer.alloc(2);
  length.writeUInt16BE(key.credentialId.length);
  return Buffer.concat([
    head,
    Buffer.from(madeBy.replaceAll('-', ''), 'hex'),
    length,
    key.credentialId,
    coseKey(key.publicKey),
  ]);
}

/** `{ fmt: "none", attStmt: {}, authData }` in CBOR: a passkey that doesn't say who built it. */
function attestation(authData: Buffer): Buffer {
  const text = (value: string) =>
    Buffer.concat([Buffer.from([0x60 + value.length]), Buffer.from(value)]);
  return Buffer.concat([
    Buffer.from([0xa3]),
    text('fmt'),
    text('none'),
    text('attStmt'),
    Buffer.from([0xa0]),
    text('authData'),
    Buffer.from([0x58, authData.length]),
    authData,
  ]);
}

const clientData = (type: 'webauthn.create' | 'webauthn.get', challenge: string, origin: string) =>
  Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));

/**
 * "Add a passkey", for whoever is signed in in this jar: asks Gaff for its options, makes the
 * passkey, and hands back the public half, as the browser would.
 */
export async function addSoftwarePasskey(
  jar: Jar,
  options: { synced?: boolean; madeBy?: string; origin?: string } = {},
): Promise<SoftwarePasskey> {
  const asked = await auth().api.generatePasskeyRegistrationOptions({
    headers: jar.headers(),
    query: {},
    returnHeaders: true,
  });
  jar.take(asked.headers);
  const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const key: SoftwarePasskey = {
    credentialId: randomBytes(16),
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    synced: options.synced ?? true,
    userHandle: asked.response.user.id,
  };
  const authData = authenticatorData(key, RP_ID, options.madeBy ?? NO_NAME);
  const id = b64url(key.credentialId);
  await auth().api.verifyPasskeyRegistration({
    body: {
      response: {
        id,
        rawId: id,
        type: 'public-key',
        authenticatorAttachment: 'platform',
        response: {
          clientDataJSON: b64url(
            clientData('webauthn.create', asked.response.challenge, options.origin ?? APP_ORIGIN),
          ),
          attestationObject: b64url(attestation(authData)),
          transports: ['internal', 'hybrid'],
        },
      },
    },
    headers: jar.headers(),
  });
  return key;
}

/** The passkey's answer to a sign-in challenge, signed, as the browser would send it. */
export function passkeyAnswer(
  key: SoftwarePasskey,
  challenge: string,
  options: { origin?: string; rpId?: string; signWith?: KeyObject } = {},
) {
  const authData = authenticatorData(key, options.rpId ?? RP_ID);
  const client = clientData('webauthn.get', challenge, options.origin ?? APP_ORIGIN);
  const signature = sign(
    'sha256',
    Buffer.concat([authData, sha256(client)]),
    options.signWith ?? key.privateKey,
  );
  const id = b64url(key.credentialId);
  return {
    id,
    rawId: id,
    type: 'public-key' as const,
    authenticatorAttachment: 'platform' as const,
    clientExtensionResults: {},
    response: {
      clientDataJSON: b64url(client),
      authenticatorData: b64url(authData),
      signature: b64url(signature),
      userHandle: b64url(Buffer.from(key.userHandle)),
    },
  };
}

/** Asks Gaff for a sign-in challenge, in this jar (the challenge is tied to the browser). */
export async function passkeyChallenge(jar: Jar, address?: string): Promise<string> {
  const asked = await auth().api.generatePasskeyAuthenticationOptions({
    headers: jar.headers(address),
    returnHeaders: true,
  });
  jar.take(asked.headers);
  return asked.response.challenge;
}

/**
 * "Sign in with a passkey", end to end. Throws what Gaff refused with, if it refused. `answer`
 * lets a test tamper with what the passkey sends.
 */
export async function signInWithSoftwarePasskey(
  key: SoftwarePasskey,
  jar: Jar,
  options: Parameters<typeof passkeyAnswer>[2] & { address?: string } = {},
): Promise<Jar> {
  const challenge = await passkeyChallenge(jar, options.address);
  const verified = await auth().api.verifyPasskeyAuthentication({
    body: { response: passkeyAnswer(key, challenge, options) },
    headers: jar.headers(options.address),
    returnHeaders: true,
  });
  return jar.take(verified.headers);
}
