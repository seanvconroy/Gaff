import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { PASSWORD_FAILURES, perAddress, perEmail } from '@/domain/auth/limits';
import { auth } from '@/server/auth/auth';
import { addPassword, changePassword, signInWithPassword } from '@/server/auth/flows';
import { Jar, signInByCode } from './provider-helpers';
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
    // A route browsers call for themselves: the challenge for a passkey sign-in.
    const address = `http-${unique()}`;
    const ask = async () => {
      const response = await auth().handler(
        new Request('http://localhost:3000/api/auth/passkey/generate-authenticate-options', {
          headers: { 'x-forwarded-for': address },
        }),
      );
      return response.status;
    };
    for (let i = 0; i < perAddress.passkey_options.max; i++) expect(await ask()).toBe(200);
    expect(await ask()).toBe(429);
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

describe('AU12: a session that’s signed in can’t be used to guess its owner’s password', () => {
  const GOOD = 'the bins go out on tuesday';
  const NEXT = 'a different sentence entirely';

  async function someoneWithAPassword() {
    const email = anEmail();
    const jar = await signInByCode(email);
    expect(await addPassword(GOOD, jar.headers())).toBe('done');
    return { email, jar };
  }

  it('slows guesses at the current password from one address', async () => {
    const { jar } = await someoneWithAPassword();
    const address = unique();
    const guess = (n: number) =>
      changePassword({ current: `not the password ${n}`, next: NEXT }, jar.headers(address));
    for (let i = 0; i < perAddress.password.max; i += 1) {
      expect(await guess(i)).toBe('wrong_current');
    }
    expect(await guess(99)).toBe('slow_down');
  });

  it('pauses password checks for the account after 10 wrong tries, wherever they come from', async () => {
    const { email, jar } = await someoneWithAPassword();
    // Each guess from another address, so only the count for the account stops them.
    for (let i = 0; i < PASSWORD_FAILURES.max; i += 1) {
      expect(
        await changePassword({ current: `not the password ${i}`, next: NEXT }, jar.headers()),
      ).toBe('wrong_current');
    }
    // Now even the right password isn't checked, here or at sign-in.
    expect(await changePassword({ current: GOOD, next: NEXT }, jar.headers())).toBe('paused');
    expect(await signInWithPassword({ email, password: GOOD }, from(unique()))).toEqual({
      outcome: 'paused',
    });
    // The password is unchanged, and a code still gets its owner in.
    expect((await signInByCode(email)).signedIn).toBe(true);
  });

  it('limits the library’s own password check the same way', async () => {
    const { jar } = await someoneWithAPassword();
    const address = unique();
    const check = () =>
      refusalOf(
        auth().api.verifyPassword({
          body: { password: 'not the password at all' },
          headers: jar.headers(address),
        }),
      );
    for (let i = 0; i < perAddress.password.max; i += 1) {
      expect(await check()).toMatch(/^other: /);
    }
    expect(await check()).toBe(SLOW_DOWN);
  });

  it('a right password clears the count, so a few slips over a day never add up', async () => {
    const { email, jar } = await someoneWithAPassword();
    for (let i = 0; i < 3; i += 1) {
      expect(await changePassword({ current: `a slip ${i}`, next: NEXT }, jar.headers())).toBe(
        'wrong_current',
      );
    }
    expect(await changePassword({ current: GOOD, next: NEXT }, jar.headers())).toBe('done');
    expect(await triesSoFar('password_failures', email, PASSWORD_FAILURES.windowSeconds)).toBe(0);
  });
});

describe('AU12: only a few of the library’s routes are for browsers', () => {
  const APP = process.env.APP_URL ?? 'http://localhost:3000';
  const GOOD = 'the bins go out on tuesday';

  function post(path: string, body: unknown, jar = new Jar()): Promise<Response> {
    const headers = jar.headers();
    headers.set('content-type', 'application/json');
    headers.set('origin', APP);
    return auth().handler(
      new Request(`${APP}/api/auth${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }),
    );
  }
  const get = (path: string, jar = new Jar()) =>
    auth().handler(new Request(`${APP}/api/auth${path}`, { headers: jar.headers() }));

  it('answers “not found” over HTTP for the routes Gaff’s own forms and pages use', async () => {
    const email = anEmail();
    const jar = await signInByCode(email);
    expect(await addPassword(GOOD, jar.headers())).toBe('done');
    const stranger = anEmail();

    const calls: [string, unknown][] = [
      ['/sign-up/email', { email: stranger, password: GOOD, name: 'Someone' }],
      ['/sign-in/email', { email, password: GOOD }],
      ['/sign-in/email-otp', { email, otp: '000000' }],
      ['/email-otp/send-verification-otp', { email: stranger, type: 'sign-in' }],
      ['/change-password', { currentPassword: GOOD, newPassword: 'a different sentence entirely' }],
      ['/verify-password', { password: GOOD }],
      ['/link-social', { provider: 'google' }],
      ['/unlink-account', { accountId: 'anything' }],
      ['/passkey/delete-passkey', { id: 'anything' }],
      ['/passkey/update-passkey', { id: 'anything', name: 'x' }],
      ['/revoke-other-sessions', {}],
      ['/sign-out', {}],
    ];
    for (const [path, body] of calls) {
      expect([path, (await post(path, body, jar)).status]).toEqual([path, 404]);
    }

    // Nothing happened: the person is still signed in, their password is the same, and no
    // account or code was made for the stranger's address.
    expect((await auth().api.getSession({ headers: jar.headers() }))?.user.email).toBe(email);
    expect(await signInWithPassword({ email, password: GOOD }, from(unique()))).toEqual({
      outcome: 'signed_in',
    });
    const made = await db().execute(sql`select 1 from users where email = ${stranger}`);
    expect(made.rows).toEqual([]);
  });

  it('keeps routes Gaff doesn’t use at all closed too', async () => {
    const email = anEmail();
    const jar = await signInByCode(email);
    const calls: [string, unknown][] = [
      // A browser can't rename the account, or say how its session began (M5).
      ['/update-user', { name: 'Someone Else' }],
      ['/update-session', { signInMethod: 'passkey' }],
      ['/change-email', { newEmail: anEmail() }],
      ['/email-otp/request-email-change', { newEmail: anEmail() }],
      ['/delete-user', {}],
      ['/request-password-reset', { email }],
    ];
    for (const [path, body] of calls) {
      expect([path, (await post(path, body, jar)).status]).toEqual([path, 404]);
    }
    const session = await auth().api.getSession({ headers: jar.headers() });
    expect(session?.user).toMatchObject({ email, name: expect.not.stringContaining('Someone') });
    expect(session?.session).toMatchObject({ signInMethod: 'email_code' });
  });

  it('still answers what only a browser can do: passkeys, and coming back from a provider', async () => {
    const jar = await signInByCode(anEmail());
    expect((await get('/get-session', jar)).status).toBe(200);
    expect((await get('/passkey/generate-authenticate-options')).status).toBe(200);
    expect((await get('/passkey/generate-register-options', jar)).status).toBe(200);
    // A provider's answer with nothing in it is turned away by the library itself, not as
    // "not found": the route is there.
    const back = await get('/callback/google?error=access_denied&state=none');
    expect(back.status).not.toBe(404);
  });
});
