import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { sealStandInPerson, standInPerson } from '@/adapters/sign-in/stand-in';
import { signInCodeEmail } from '@/copy/sign-in';
import { db } from '@/db/client';
import { accounts, sessions, users } from '@/db/schema';
import { isAppleRelayAddress } from '@/domain/auth/methods';
import { SESSION_LASTS_DAYS } from '@/domain/auth/session';
import { auth, signInProviderModes } from '@/server/auth/auth';
import { sendCode } from '@/server/auth/codes';
import { cookieNames } from '@/server/auth/cookies';
import {
  newSignInAttempt,
  readSignInAttempt,
  signedSignInAttempt,
} from '@/server/auth/sign-in-steps';
import { askForCode, cookiesFrom, continueWith, signInByCode, whoIs } from './sign-in-helpers';

// The stand-ins for Google and Apple are registered only with the development tools on, and
// Better Auth's own rate limit is off only in tests: set both before anything reads them.
vi.hoisted(() => {
  process.env.DEV_TOOLS = '1';
  process.env.GAFF_ENV = 'test';
});

/**
 * UX-SI-8, UX-AC-1: accounts made by signing in, and methods joined by a verified email. The
 * real Better Auth endpoints run against the test database; Google and Apple are the stand-ins.
 */
const anEmail = () => `${randomUUID()}@test.gaff.ie`;
const DAY_MS = 24 * 60 * 60 * 1000;

const usersWith = (email: string) => db().select().from(users).where(eq(users.email, email));
const accountsOf = (userId: string) =>
  db().select().from(accounts).where(eq(accounts.userId, userId)).orderBy(accounts.providerId);

describe('UX-SI-8: new and returning people take the same path', () => {
  it('creates a person for an email nobody has, and signs them in', async () => {
    const email = anEmail();
    expect(await usersWith(email)).toEqual([]);
    const { userId, cookie } = await signInByCode(email);
    const [created] = await usersWith(email);
    expect(created).toMatchObject({ id: userId, email, emailVerified: true });
    expect(await whoIs(cookie)).toMatchObject({ id: userId, email });
  });

  it('signs a returning person in as themselves: never a second account', async () => {
    const email = anEmail();
    const first = await signInByCode(email);
    const second = await signInByCode(email);
    expect(second.userId).toBe(first.userId);
    expect(await usersWith(email)).toHaveLength(1);
  });

  it('creates nobody and signs nobody in for a wrong code', async () => {
    const email = anEmail();
    const { code, cookie } = await askForCode(email);
    const { headers, response } = await auth().api.signInWithCode({
      body: { code: code === '111111' ? '222222' : '111111' },
      headers: new Headers({ cookie }),
      returnHeaders: true,
    });
    expect(response).toEqual({ result: 'wrong' });
    expect(cookiesFrom(headers)).not.toContain('session_token');
    expect(await usersWith(email)).toEqual([]);
  });

  it('signs nobody in with the right code from another browser', async () => {
    const email = anEmail();
    const { code } = await askForCode(email);
    const { headers, response } = await auth().api.signInWithCode({
      body: { code },
      headers: new Headers({ cookie: `${cookieNames.signInCode}=${'a'.repeat(43)}` }),
      returnHeaders: true,
    });
    expect(response).toEqual({ result: 'finished' });
    expect(cookiesFrom(headers)).not.toContain('session_token');
    expect(await usersWith(email)).toEqual([]);
  });
});

describe('UX-SI-3: the email’s button, through Gaff’s own endpoint', () => {
  it('signs in where the code was asked for, and only shows the code anywhere else', async () => {
    const email = anEmail();
    let link = '';
    let code = '';
    const sent = await sendCode({
      purpose: 'sign_in',
      subject: email,
      to: email,
      browserKey: null,
      linkPath: '/sign-in/open',
      compose: (sentCode, sentLink) => {
        code = sentCode;
        link = sentLink!;
        return signInCodeEmail(sentCode, sentLink);
      },
    });
    if (!sent.sent) throw new Error('not sent');
    const token = new URL(link).searchParams.get('t')!;

    const elsewhere = await auth().api.signInWithCodeLink({
      body: { token },
      headers: new Headers(),
      returnHeaders: true,
    });
    expect(elsewhere.response).toMatchObject({ where: 'elsewhere', code });
    expect(cookiesFrom(elsewhere.headers)).not.toContain('session_token');
    expect(await usersWith(email)).toEqual([]);

    const here = await auth().api.signInWithCodeLink({
      body: { token },
      headers: new Headers({ cookie: `${cookieNames.signInCode}=${sent.browserKey}` }),
      returnHeaders: true,
    });
    expect(here.response).toMatchObject({ where: 'here' });
    expect(await whoIs(cookiesFrom(here.headers))).toMatchObject({ email });
  });
});

describe('UX-SI-1, UX-AC-1: Google and Apple, joined to one person by a verified email', () => {
  it('uses the stand-ins only where the development tools are on and no credentials are set', () => {
    expect(signInProviderModes()).toEqual({ google: 'stand_in', apple: 'stand_in' });
  });

  it('creates a person from Google, keeping who they are and nothing else', async () => {
    const email = anEmail();
    const back = await continueWith(
      standInPerson('google', { name: 'Orla Kelly', email: email.toUpperCase() }),
    );
    expect(back.signedIn).toBe(true);
    expect(back.location.pathname).toBe('/sign-in/return');
    const [person] = await usersWith(email);
    expect(person).toMatchObject({ name: 'Orla Kelly', emailVerified: true });
    expect(await whoIs(back.cookie)).toMatchObject({ id: person!.id });
    // Sign-in only (Q30): no tokens, no scopes.
    expect(await accountsOf(person!.id)).toMatchObject([
      {
        providerId: 'google',
        accessToken: null,
        refreshToken: null,
        idToken: null,
        scope: null,
      },
    ]);
  });

  it('joins a code, Google and Apple with the same verified email to one person', async () => {
    // AU4: each provider joins only an address it looks after. Google Workspace looks after a
    // work address (the stand-in's Google does, unless told otherwise); Apple looks after iCloud.
    const work = anEmail();
    const byCode = await signInByCode(work);
    const google = await continueWith(standInPerson('google', { name: 'Orla Kelly', email: work }));
    expect(google.signedIn).toBe(true);
    expect((await whoIs(google.cookie))?.id).toBe(byCode.userId);
    // And back again by Google: the same person, and still one method.
    const again = await continueWith(standInPerson('google', { name: 'Orla Kelly', email: work }));
    expect((await whoIs(again.cookie))?.id).toBe(byCode.userId);
    expect((await accountsOf(byCode.userId)).map((account) => account.providerId)).toEqual([
      'google',
    ]);
    expect(await usersWith(work)).toHaveLength(1);

    const icloud = `${randomUUID()}@icloud.com`;
    const owner = await signInByCode(icloud);
    const google2 = await continueWith(
      standInPerson('google', { name: 'Orla Kelly', email: icloud, notHosted: true }),
    );
    expect(google2.signedIn).toBe(false);
    const apple = await continueWith(standInPerson('apple', { name: 'Orla Kelly', email: icloud }));
    expect(apple.signedIn).toBe(true);
    expect((await whoIs(apple.cookie))?.id).toBe(owner.userId);
    expect((await accountsOf(owner.userId)).map((account) => account.providerId)).toEqual([
      'apple',
    ]);
  });

  it('never joins a provider whose email isn’t verified to someone’s account', async () => {
    const email = anEmail();
    const owner = await signInByCode(email);
    const back = await continueWith(
      standInPerson('google', { name: 'Not Orla', email, unverified: true }),
    );
    // Back at the sign-in screen with a problem, signed in as nobody, joined to nothing.
    expect(back.signedIn).toBe(false);
    expect(back.location.pathname).toBe('/sign-in');
    expect(back.location.searchParams.get('error')).toBe('account_not_linked');
    expect(await accountsOf(owner.userId)).toEqual([]);
    expect(await usersWith(email)).toHaveLength(1);
  });

  it('AU4: makes nobody from a provider that never verified the address', async () => {
    const email = anEmail();
    const squatter = await continueWith(
      standInPerson('google', { name: 'Not Orla', email, unverified: true }),
    );
    expect(squatter.signedIn).toBe(false);
    expect(squatter.location.searchParams.get('error')).toBe('email_not_verified');
    expect(await usersWith(email)).toEqual([]);
  });

  it('lets the owner of an address take back one a provider made without verifying it', async () => {
    // Made before AU4, when a provider's unverified claim could still make someone.
    const email = anEmail();
    const id = randomUUID();
    await db().insert(users).values({ id, email, name: 'Not Orla', emailVerified: false });
    await db()
      .insert(accounts)
      .values({ id: randomUUID(), userId: id, providerId: 'google', accountId: randomUUID() });
    // The mailbox's owner proves the address with a code: what was attached before goes.
    const owner = await signInByCode(email);
    expect(owner.userId).toBe(id);
    expect((await usersWith(email))[0]).toMatchObject({ emailVerified: true });
    expect(await accountsOf(id)).toEqual([]);
    expect(await whoIs(owner.cookie)).toMatchObject({ id: owner.userId });
  });

  it('UX-SI-11: accepts Apple’s “Hide My Email” relay address as the person’s email', async () => {
    const person = standInPerson('apple', {
      name: 'Cian Byrne',
      email: anEmail(),
      hideEmail: true,
    });
    expect(isAppleRelayAddress(person.email)).toBe(true);
    const back = await continueWith(person);
    expect(back.signedIn).toBe(true);
    expect(await whoIs(back.cookie)).toMatchObject({ email: person.email, emailVerified: true });
    // The same person comes back to the same account, by the same relay address.
    const again = await continueWith(person);
    expect((await whoIs(again.cookie))?.id).toBe((await whoIs(back.cookie))?.id);
    expect(await usersWith(person.email)).toHaveLength(1);
  });

  it('takes a stand-in’s note once it’s sealed for that provider, and only for five minutes', async () => {
    const { openStandInPerson } = await import('@/adapters/sign-in/stand-in');
    const person = standInPerson('google', { name: 'Orla Kelly', email: anEmail() });
    const note = sealStandInPerson(person, Date.now());
    expect(openStandInPerson(note, 'google')).toEqual(person);
    expect(openStandInPerson(note, 'apple')).toBeNull();
    expect(openStandInPerson(note, 'google', Date.now() + 6 * 60_000)).toBeNull();
    expect(openStandInPerson('made-up', 'google')).toBeNull();
  });
});

describe('UX-SI-9: a session lasts 30 days from last use on that device', () => {
  const sessionOf = async (userId: string) =>
    (
      await db()
        .select()
        .from(sessions)
        .where(eq(sessions.userId, userId))
        .orderBy(desc(sessions.createdAt))
        .limit(1)
    )[0]!;

  it('starts with 30 days', async () => {
    const { userId } = await signInByCode(anEmail());
    const left = (await sessionOf(userId)).expiresAt.getTime() - Date.now();
    expect(SESSION_LASTS_DAYS).toBe(30);
    expect(left).toBeGreaterThan(30 * DAY_MS - 60_000);
    expect(left).toBeLessThanOrEqual(30 * DAY_MS);
  });

  it('is given 30 days again when it’s used', async () => {
    const { userId, cookie } = await signInByCode(anEmail());
    const session = await sessionOf(userId);
    // Two days on: 28 days are left.
    await db()
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + 28 * DAY_MS) })
      .where(eq(sessions.id, session.id));
    expect(await whoIs(cookie)).toMatchObject({ id: userId });
    const left = (await sessionOf(userId)).expiresAt.getTime() - Date.now();
    expect(left).toBeGreaterThan(30 * DAY_MS - 60_000);
  });

  it('ends once 30 days pass without use', async () => {
    const { userId, cookie } = await signInByCode(anEmail());
    await db()
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.userId, userId));
    expect(await whoIs(cookie)).toBeNull();
  });
});

describe('UX-ME-1: a try at signing in is counted only if the server made it', () => {
  it('reads back the ID it signed', () => {
    const id = randomUUID();
    expect(readSignInAttempt(signedSignInAttempt(id))).toBe(id);
    expect(readSignInAttempt(newSignInAttempt())).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('ignores a made-up ID, a changed one and one more than an hour old', () => {
    const id = randomUUID();
    const signed = signedSignInAttempt(id);
    expect(readSignInAttempt(id)).toBeNull();
    expect(readSignInAttempt(`${randomUUID()}.${signed.split('.').slice(1).join('.')}`)).toBeNull();
    const [, expires, signature] = signed.split('.');
    expect(readSignInAttempt(`${id}.${Number(expires) + 1}.${signature}`)).toBeNull();
    expect(readSignInAttempt(signed, Date.now() + 61 * 60_000)).toBeNull();
    for (const value of [undefined, null, '', 'ann@example.ie', `${id}..`, ['a']]) {
      expect(readSignInAttempt(value)).toBeNull();
    }
  });
});
