import { generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { APPLE_SECRET_DAYS, appleClientSecret } from './apple-client-secret';

// A throwaway key of the kind Apple issues (P-256), made for this test only.
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const now = new Date('2026-11-13T12:00:00Z');
const input = { teamId: 'TEAM123456', clientId: 'ie.gaff.signin', keyId: 'KEY1234567', now };

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

describe('AU1: the client secret Apple asks for', () => {
  it('is a token signed with the Sign in with Apple key, as Apple’s rules ask', () => {
    const secret = appleClientSecret({ ...input, privateKey: pem });
    const [header, claims, signature] = secret.split('.');
    expect(decode(header!)).toEqual({ alg: 'ES256', kid: 'KEY1234567' });
    expect(decode(claims!)).toEqual({
      iss: 'TEAM123456',
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(now.getTime() / 1000) + APPLE_SECRET_DAYS * 86_400,
      aud: 'https://appleid.apple.com',
      sub: 'ie.gaff.signin',
    });
    expect(
      verify(
        'sha256',
        Buffer.from(`${header}.${claims}`),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature!, 'base64url'),
      ),
    ).toBe(true);
  });

  it('lasts less than Apple’s 6-month limit', () => {
    expect(APPLE_SECRET_DAYS * 86_400).toBeLessThan(15_777_000);
  });

  it('reads a key whose line breaks were pasted as "\\n"', () => {
    const pasted = pem.trim().replace(/\n/g, '\\n');
    expect(pasted).not.toContain('\n');
    const secret = appleClientSecret({ ...input, privateKey: pasted });
    const [header, claims, signature] = secret.split('.');
    expect(
      verify(
        'sha256',
        Buffer.from(`${header}.${claims}`),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature!, 'base64url'),
      ),
    ).toBe(true);
  });

  it('says so plainly when the key isn’t a key', () => {
    expect(() => appleClientSecret({ ...input, privateKey: 'not a key' })).toThrow();
  });
});
