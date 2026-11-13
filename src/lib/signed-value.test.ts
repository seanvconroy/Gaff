import { describe, expect, it } from 'vitest';
import { openSigned, signValue } from './signed-value';

const secret = 'a-test-secret-that-is-at-least-32-characters';
const now = new Date('2026-11-13T12:00:00Z');
const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

describe('AU2: a signed value that carries a sign-in step between pages', () => {
  it('opens what was signed, until it expires', () => {
    const token = signValue({ email: 'ann@halcyon.test', next: '/my' }, secret, later(15));
    expect(openSigned(token, secret, now)).toEqual({ email: 'ann@halcyon.test', next: '/my' });
    expect(openSigned(token, secret, later(14))).toEqual({
      email: 'ann@halcyon.test',
      next: '/my',
    });
    expect(openSigned(token, secret, later(15))).toBeNull();
  });

  it('refuses a value that was changed, or signed with another secret', () => {
    const token = signValue({ userId: 'u1' }, secret, later(15));
    const [payload, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ v: { userId: 'u2' }, e: later(15).getTime() }),
    ).toString('base64url');
    expect(openSigned(`${forged}.${signature}`, secret, now)).toBeNull();
    expect(openSigned(`${payload}.${signature!.slice(0, -2)}xx`, secret, now)).toBeNull();
    expect(openSigned(token, 'another-secret-that-is-at-least-32-chars', now)).toBeNull();
  });

  it('refuses anything that isn’t one of ours', () => {
    for (const junk of [undefined, '', 'abc', 'a.b', 'a.b.c', '.', '..']) {
      expect(openSigned(junk, secret, now)).toBeNull();
    }
  });
});
