import { generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  APPLE_SECRET_DAYS,
  appleClientSecret,
  appleConfigured,
  appleSecretFrom,
} from './apple-client-secret';

// A throwaway key of the kind Apple issues (P-256), made for this test only.
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const now = new Date('2026-11-19T12:00:00Z');
const input = { teamId: 'TEAM123456', clientId: 'ie.gaff.signin', keyId: 'KEY1234567', now };

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
const signedByTheKey = (secret: string) => {
  const [header, claims, signature] = secret.split('.');
  return verify(
    'sha256',
    Buffer.from(`${header}.${claims}`),
    { key: publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(signature!, 'base64url'),
  );
};

describe('BA-8, AU1: the client secret Apple asks for', () => {
  it('is a token signed with the Sign in with Apple key, as Apple’s rules ask', () => {
    const secret = appleClientSecret({ ...input, privateKey: pem });
    const [header, claims] = secret.split('.');
    expect(decode(header!)).toEqual({ alg: 'ES256', kid: 'KEY1234567' });
    expect(decode(claims!)).toEqual({
      iss: 'TEAM123456',
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(now.getTime() / 1000) + APPLE_SECRET_DAYS * 86_400,
      aud: 'https://appleid.apple.com',
      sub: 'ie.gaff.signin',
    });
    expect(signedByTheKey(secret)).toBe(true);
  });

  it('lasts less than Apple’s six-month limit', () => {
    expect(APPLE_SECRET_DAYS * 86_400).toBeLessThan(15_777_000);
  });

  it('reads a key whose line breaks were pasted as "\\n"', () => {
    const pasted = pem.trim().replace(/\n/g, '\\n');
    expect(pasted).not.toContain('\n');
    expect(signedByTheKey(appleClientSecret({ ...input, privateKey: pasted }))).toBe(true);
  });

  it('says so plainly when the key isn’t a key', () => {
    expect(() => appleClientSecret({ ...input, privateKey: 'not a key' })).toThrow();
  });
});

describe('BA-8: where Apple’s secret comes from', () => {
  const made = {
    APPLE_CLIENT_ID: 'ie.gaff.signin',
    APPLE_TEAM_ID: 'TEAM123456',
    APPLE_KEY_ID: 'KEY1234567',
    APPLE_PRIVATE_KEY: pem,
  };

  it('is made on the server from the team ID, key ID and private key', () => {
    expect(appleConfigured(made)).toBe(true);
    const secret = appleSecretFrom(made, now)!;
    expect(decode(secret.split('.')[1]!)).toMatchObject({ iss: 'TEAM123456' });
    expect(signedByTheKey(secret)).toBe(true);
  });

  it('is the static secret where one is still set', () => {
    const fixed = { APPLE_CLIENT_ID: 'ie.gaff.signin', APPLE_CLIENT_SECRET: 'a-static-secret' };
    expect(appleConfigured(fixed)).toBe(true);
    expect(appleSecretFrom(fixed)).toBe('a-static-secret');
    expect(appleSecretFrom({ ...made, APPLE_CLIENT_SECRET: 'a-static-secret' })).toBe(
      'a-static-secret',
    );
  });

  it('is off without the Services ID, or without everything a secret is made from', () => {
    expect(appleConfigured({})).toBe(false);
    expect(appleConfigured({ ...made, APPLE_CLIENT_ID: undefined })).toBe(false);
    expect(appleConfigured({ ...made, APPLE_PRIVATE_KEY: undefined })).toBe(false);
    expect(appleSecretFrom({ ...made, APPLE_KEY_ID: undefined })).toBeNull();
  });
});
