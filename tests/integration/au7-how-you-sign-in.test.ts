import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withSystem } from '@/db/client';
import { accounts, platformEvents, sessions, users } from '@/db/schema';
import { auth } from '@/server/auth/auth';
import { addPassword, sendSignInCode } from '@/server/auth/flows';
import {
  disconnectProvider,
  signInOverview,
  signOutDevice,
  signOutOtherDevices,
} from '@/server/auth/security';
import { standInIdentity } from '@/server/auth/stand-in-provider';
import { connect, continueWith, Jar, latestCodeTo, signInByCode } from './provider-helpers';

const tag = () => crypto.randomUUID().slice(0, 8);
const work = () => `ann@halcyon-${tag()}.test`;
const gmail = () => `ann.${tag()}@gmail.com`;
const GOOD = 'the bins go out on tuesday';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const LAPTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

async function userFor(email: string) {
  const [user] = await db().select().from(users).where(eq(users.email, email));
  return user!;
}

/** Signs in with an emailed code from a browser that says what it is. */
async function signInFrom(email: string, userAgent: string, jar = new Jar()): Promise<Jar> {
  const sent = await sendSignInCode(email, jar.headers());
  if (sent !== 'sent') throw new Error(`code not sent: ${sent}`);
  const headers = jar.headers();
  headers.set('user-agent', userAgent);
  const signedIn = await auth().api.signInEmailOTP({
    body: { email, otp: await latestCodeTo(email) },
    headers,
    returnHeaders: true,
  });
  return jar.take(signedIn.headers);
}

async function sessionOf(jar: Jar) {
  const found = await auth().api.getSession({ headers: jar.headers() });
  return found?.session ?? null;
}

async function sessionsOf(userId: string) {
  return db().select().from(sessions).where(eq(sessions.userId, userId));
}

async function ageSessions(userId: string, minutes: number): Promise<void> {
  await db().execute(
    sql`update sessions set created_at = now() - make_interval(mins => ${minutes}) where user_id = ${userId}`,
  );
}

async function eventsOf(userId: string): Promise<{ type: string; data: unknown }[]> {
  return withSystem((tx) =>
    tx
      .select({ type: platformEvents.type, data: platformEvents.data })
      .from(platformEvents)
      .where(and(eq(platformEvents.subjectType, 'user'), eq(platformEvents.subjectId, userId)))
      .orderBy(platformEvents.id),
  );
}

const waysIn = async (userId: string) =>
  (await db().select().from(accounts).where(eq(accounts.userId, userId)))
    .map((a) => a.providerId)
    .sort();

describe('AU7: how you sign in', () => {
  it('shows a new account’s one way in: a code by email', async () => {
    const email = work();
    const jar = await signInFrom(email, IPHONE);
    const user = await userFor(email);
    const current = await sessionOf(jar);

    const overview = await signInOverview(user.id, current!.id);
    expect(overview).toMatchObject({
      hasPassword: false,
      providers: { google: null, apple: null },
      passkeys: [],
    });
    expect(overview.devices).toMatchObject([
      { id: current!.id, words: 'Safari on an iPhone', method: 'email_code', current: true },
    ]);
  });

  it('shows a password and Google once they’re added', async () => {
    const email = work();
    const jar = await signInByCode(email);
    const user = await userFor(email);
    expect(await addPassword(GOOD, jar.headers())).toBe('done');
    expect((await connect('google', { email }, jar)).error).toBeNull();

    const overview = await signInOverview(user.id, 'no-session');
    expect(overview.hasPassword).toBe(true);
    expect(overview.providers.google).toBeInstanceOf(Date);
    expect(overview.providers.apple).toBeNull();
  });

  it('disconnects Google, which then can’t be used to get in, and records it', async () => {
    const email = work();
    const jar = await signInByCode(email);
    const user = await userFor(email);
    await connect('google', { email }, jar);
    expect((await continueWith('google', { email })).error).toBeNull();

    expect(await disconnectProvider(user.id, 'google', jar.headers())).toBe('done');
    expect(await waysIn(user.id)).toEqual([]);
    expect((await eventsOf(user.id)).at(-1)).toEqual({
      type: 'account.method_removed',
      data: { method: 'google' },
    });
    // Google doesn't host this address, so it can't walk back in on its own.
    const after = await continueWith('google', { email });
    expect(after.error).toBe('account_not_linked');
    expect(after.jar.signedIn).toBe(false);
    // A code by email still works.
    expect((await signInByCode(email)).signedIn).toBe(true);
  });

  it('says so when there’s nothing to disconnect', async () => {
    const email = work();
    const jar = await signInByCode(email);
    const user = await userFor(email);
    expect(await disconnectProvider(user.id, 'apple', jar.headers())).toBe('not_found');
  });

  it('asks to sign in again before disconnecting, when the sign-in is over an hour old', async () => {
    const email = work();
    const jar = await signInByCode(email);
    const user = await userFor(email);
    await connect('google', { email }, jar);
    await ageSessions(user.id, 61);
    expect(await disconnectProvider(user.id, 'google', jar.headers())).toBe(
      'recent_sign_in_needed',
    );
    expect(await waysIn(user.id)).toEqual(['google']);
  });

  it('lets an account made with Google alone disconnect it: a code by email still gets them in', async () => {
    const email = gmail();
    const made = await continueWith('google', { email });
    const user = await userFor(email);
    expect(await disconnectProvider(user.id, 'google', made.jar.headers())).toBe('done');
    expect(await waysIn(user.id)).toEqual([]);
    expect((await signInByCode(email)).signedIn).toBe(true);
    expect((await userFor(email)).id).toBe(user.id);
  });

  it('keeps Apple on an account whose address Apple made (Hide My Email)', async () => {
    const real = `ann.${tag()}@icloud.com`;
    const made = await continueWith('apple', { email: real, hidden: true });
    const relay = standInIdentity('apple', { email: real, name: '', verified: true, hidden: true });
    const user = await userFor(relay.email);
    expect(await disconnectProvider(user.id, 'apple', made.jar.headers())).toBe('not_allowed');
    expect(await waysIn(user.id)).toEqual(['apple']);
  });

  it('only ever changes the account of the person who’s signed in', async () => {
    const email = work();
    const jar = await signInByCode(email);
    const user = await userFor(email);
    await connect('google', { email }, jar);
    const other = await signInByCode(work());

    // Another person's browser, naming this account: Better Auth acts on the session's account.
    expect(await disconnectProvider(user.id, 'google', other.headers())).toBe('not_found');
    expect(await disconnectProvider(user.id, 'google', new Jar().headers())).toBe('not_found');
    expect(await waysIn(user.id)).toEqual(['google']);
  });
});

describe('AU8: signed-in devices', () => {
  it('lists each device in words, this one first, and never the raw browser text', async () => {
    const email = work();
    const phone = await signInFrom(email, IPHONE);
    const laptop = await signInFrom(email, LAPTOP);
    const user = await userFor(email);
    const current = await sessionOf(phone);
    const other = await sessionOf(laptop);

    const overview = await signInOverview(user.id, current!.id);
    expect(overview.devices.map((d) => [d.words, d.current])).toEqual([
      ['Safari on an iPhone', true],
      ['Chrome on Windows', false],
    ]);
    expect(overview.devices[1]!.id).toBe(other!.id);
    expect(JSON.stringify(overview)).not.toContain('Mozilla');
  });

  it('keeps one session for a browser: signing in again replaces it', async () => {
    const email = work();
    const jar = await signInFrom(email, IPHONE);
    const user = await userFor(email);
    const first = await sessionOf(jar);

    // "Confirm it's you": the same browser signs in again.
    await signInFrom(email, IPHONE, jar);
    const second = await sessionOf(jar);
    expect(second!.id).not.toBe(first!.id);
    const all = await sessionsOf(user.id);
    expect(all.map((s) => s.id)).toEqual([second!.id]);
  });

  it('signs one other device out, and leaves this one signed in', async () => {
    const email = work();
    const phone = await signInFrom(email, IPHONE);
    const laptop = await signInFrom(email, LAPTOP);
    const user = await userFor(email);
    const other = await sessionOf(laptop);

    expect(await signOutDevice(user.id, other!.id, phone.headers())).toBe('done');
    expect(await sessionOf(laptop)).toBeNull();
    expect(await sessionOf(phone)).not.toBeNull();
    expect((await eventsOf(user.id)).at(-1)).toEqual({
      type: 'account.signed_out_elsewhere',
      data: { sessions: 1 },
    });
    // It's gone now.
    expect(await signOutDevice(user.id, other!.id, phone.headers())).toBe('not_found');
  });

  it('won’t sign out a device on someone else’s account', async () => {
    const email = work();
    const mine = await signInFrom(email, IPHONE);
    const user = await userFor(email);
    const theirsEmail = work();
    const theirs = await signInFrom(theirsEmail, LAPTOP);
    const theirSession = await sessionOf(theirs);

    expect(await signOutDevice(user.id, theirSession!.id, mine.headers())).toBe('not_found');
    expect(await sessionOf(theirs)).not.toBeNull();
  });

  it('signs every other device out at once, and says how many', async () => {
    const email = work();
    const phone = await signInFrom(email, IPHONE);
    const laptop = await signInFrom(email, LAPTOP);
    const tablet = await signInFrom(email, LAPTOP);
    const user = await userFor(email);
    const current = await sessionOf(phone);

    expect(await signOutOtherDevices(user.id, current!.id, phone.headers())).toBe(2);
    expect(await sessionOf(laptop)).toBeNull();
    expect(await sessionOf(tablet)).toBeNull();
    expect((await sessionsOf(user.id)).map((s) => s.id)).toEqual([current!.id]);
    expect((await eventsOf(user.id)).at(-1)).toEqual({
      type: 'account.signed_out_elsewhere',
      data: { sessions: 2 },
    });
    // Nothing left to sign out.
    expect(await signOutOtherDevices(user.id, current!.id, phone.headers())).toBe(0);
  });
});
