import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { perAddress, perEmail } from '@/domain/auth/limits';
import { auth } from '@/server/auth/auth';
import {
  clientAddress,
  countTry,
  forgetTries,
  refusal,
  SLOW_DOWN,
  sweepLimits,
  triesSoFar,
} from '@/server/auth/limits';

/** Each test signs in "from" its own made-up address, so tests never share a counter. */
const from = (address: string) => new Headers({ 'x-forwarded-for': address });
const unique = () => crypto.randomUUID();
const anEmail = () => `${unique()}@limits.test.gaff.ie`;

async function refusalOf(call: Promise<unknown>): Promise<string | null> {
  try {
    await call;
    return null;
  } catch (error) {
    return refusal(error) ?? `other: ${(error as Error).message}`;
  }
}

describe('AU12: limits on signing in', () => {
  it('counts tries in a window, and starts again when the window ends', async () => {
    const who = unique();
    const start = new Date('2026-11-13T10:00:00Z');
    expect(await countTry('test', who, 60, start)).toBe(1);
    expect(await countTry('test', who, 60, new Date(start.getTime() + 30_000))).toBe(2);
    expect(await triesSoFar('test', who, 60, new Date(start.getTime() + 59_000))).toBe(2);
    // A minute after the first try, the window is over.
    expect(await triesSoFar('test', who, 60, new Date(start.getTime() + 60_000))).toBe(0);
    expect(await countTry('test', who, 60, new Date(start.getTime() + 60_000))).toBe(1);
  });

  it('counts each person and each kind of try on its own', async () => {
    const a = unique();
    const b = unique();
    await countTry('test', a, 60);
    await countTry('test', a, 60);
    expect(await countTry('test', b, 60)).toBe(1);
    expect(await countTry('other', a, 60)).toBe(1);
    await forgetTries('test', a);
    expect(await triesSoFar('test', a, 60)).toBe(0);
    expect(await triesSoFar('other', a, 60)).toBe(1);
  });

  it('counts at once from many requests without losing any', async () => {
    const who = unique();
    const counts = await Promise.all(Array.from({ length: 12 }, () => countTry('test', who, 60)));
    expect([...counts].sort((x, y) => x - y)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });

  it('stores no address or email: only a hash, a count and when the window began', async () => {
    const email = anEmail();
    const address = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    await auth().api.sendVerificationOTP({
      body: { email, type: 'sign-in' },
      headers: from(address),
    });
    const { rows } = await db().execute<{ row: string }>(
      sql`select auth_limits::text as row from auth_limits`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const { row } of rows) {
      expect(row).not.toContain(email);
      expect(row).not.toContain(address);
      expect(row).toMatch(/^\([0-9a-f]{64},\d+,/);
    }
  });

  it('limits calls made in-process, the way Gaff’s forms make them', async () => {
    // The gap this closes: the library's own limiter only sees HTTP requests, so before this a
    // form could ask for sign-in emails to any address as often as it liked.
    const address = from(`in-process-${unique()}`);
    const send = () =>
      refusalOf(
        auth().api.sendVerificationOTP({
          body: { email: anEmail(), type: 'sign-in' },
          headers: address,
        }),
      );
    for (let i = 0; i < perAddress.send_code.max; i++) expect(await send()).toBeNull();
    expect(await send()).toBe(SLOW_DOWN);
    expect(await send()).toBe(SLOW_DOWN);
  });

  it('limits codes to one email, wherever they’re asked for from', async () => {
    const email = anEmail();
    const send = () =>
      refusalOf(
        auth().api.sendVerificationOTP({
          body: { email, type: 'sign-in' },
          headers: from(`elsewhere-${unique()}`),
        }),
      );
    for (let i = 0; i < perEmail.send_code!.max; i++) expect(await send()).toBeNull();
    expect(await send()).toBe(SLOW_DOWN);
    // However the address is capitalised, it's the same inbox.
    expect(
      await refusalOf(
        auth().api.sendVerificationOTP({
          body: { email: email.toUpperCase(), type: 'sign-in' },
          headers: from(`elsewhere-${unique()}`),
        }),
      ),
    ).toBe(SLOW_DOWN);
  });

  it('limits requests that arrive over HTTP too', async () => {
    const address = `http-${unique()}`;
    const send = async () => {
      const response = await auth().handler(
        new Request('http://localhost:3000/api/auth/email-otp/send-verification-otp', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': address,
            origin: 'http://localhost:3000',
          },
          body: JSON.stringify({ email: anEmail(), type: 'sign-in' }),
        }),
      );
      return response.status;
    };
    for (let i = 0; i < perAddress.send_code.max; i++) expect(await send()).toBe(200);
    expect(await send()).toBe(429);
  });

  it('never limits reading the session, which every page does', async () => {
    const headers = from(`reader-${unique()}`);
    for (let i = 0; i < 40; i++) {
      expect(await auth().api.getSession({ headers })).toBeNull();
    }
  });

  it('reads the address a request came from, which the host sets', () => {
    expect(clientAddress(new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe(
      '203.0.113.9',
    );
    expect(clientAddress(new Headers())).toBe('local');
    expect(clientAddress(undefined)).toBe('local');
  });

  it('AU14: deletes counters a day after their window began', async () => {
    const who = unique();
    const longAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await countTry('old', who, 60, longAgo);
    await countTry('new', who, 60);
    expect(await sweepLimits()).toBeGreaterThanOrEqual(1);
    expect(await triesSoFar('old', who, 10 * 24 * 60 * 60)).toBe(0);
    expect(await triesSoFar('new', who, 60)).toBe(1);
  });
});
