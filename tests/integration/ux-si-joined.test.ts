import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { standInPerson } from '@/adapters/sign-in/stand-in';
import { db } from '@/db/client';
import { accounts, users } from '@/db/schema';
import { waitingCode } from '@/server/auth/codes';
import { cookieNames } from '@/server/auth/cookies';
import { queuedJobs } from './helpers';
import {
  askForCode,
  codeEmailedTo,
  continueWith,
  enterCode,
  signInByCode,
  whoIs,
} from './sign-in-helpers';

// The stand-ins for Google and Apple are there only with the development tools on, locally and
// in tests.
vi.hoisted(() => {
  process.env.DEV_TOOLS = '1';
  process.env.GAFF_ENV = 'test';
});

/**
 * UX-SI-15 (ADR-0033): one person, however they sign in. The real Better Auth runs against the
 * test database; Google and Apple are the stand-ins.
 */
const anEmail = () => `${randomUUID()}@joined.test.gaff.ie`;

const usersWith = (email: string) => db().select().from(users).where(eq(users.email, email));
const signInChanges = async (userId: string) =>
  (await queuedJobs('send_account_email')).filter(
    (job) => job.kind === 'sign_in_changed' && job.userId === userId,
  );
const key = (cookie: string) => cookie.split('=')[1]!;

describe('UX-SI-15: Google or Apple can’t vouch for the address, so the mailbox is asked', () => {
  const aBrowser = () =>
    `${cookieNames.signInCode}=${randomUUID().replace(/-/g, '')}${'k'.repeat(11)}`;

  it('sends a code to the address as the provider comes back, and signs nobody in yet', async () => {
    const email = anEmail();
    const browser = aBrowser();
    const person = standInPerson('google', { name: 'Ann Byrne', email, notHosted: true });
    const back = await continueWith(person, { cookie: browser });
    expect(back.signedIn).toBe(false);
    expect(back.location.searchParams.get('error')).toBe('confirm_by_code');
    expect(await usersWith(email)).toEqual([]);

    const waiting = await waitingCode('sign_in', key(browser));
    expect(waiting).toMatchObject({
      subject: email,
      open: true,
      joining: { provider: { id: 'google', accountId: person.id, name: 'Ann Byrne' } },
    });
    // The email says what entering the code does.
    const { text } = await codeEmailedTo(email);
    expect(text).toContain(
      'When you do, Google is connected to your Gaff account, and you can sign in with it from then on.',
    );
    expect(text).toContain('don’t share the code with anyone');
  });

  it('makes the person and connects Google with the one code, for an address nobody has', async () => {
    const email = anEmail();
    const browser = aBrowser();
    const person = standInPerson('google', { name: 'Ann Byrne', email, notHosted: true });
    await continueWith(person, { cookie: browser });
    const { code } = await codeEmailedTo(email);
    const { response, cookie } = await enterCode(code, browser);
    // They chose Google. Nothing was found: they go straight on to set up.
    expect(response).toMatchObject({ result: 'correct', method: 'google', found: null });
    const [made] = await usersWith(email);
    expect(made).toMatchObject({ name: 'Ann Byrne', emailVerified: true });
    expect(await whoIs(cookie)).toMatchObject({ id: made!.id });
    const ways = await db().select().from(accounts).where(eq(accounts.userId, made!.id));
    expect(ways).toEqual([
      expect.objectContaining({
        providerId: 'google',
        accountId: person.id,
        // Q30: nothing of the provider's is kept.
        accessToken: null,
        idToken: null,
      }),
    ]);
    expect(await signInChanges(made!.id)).toEqual([]);
    // From then on Google signs them straight in, by its own ID for them.
    const next = await continueWith(person);
    expect(next.signedIn).toBe(true);
    expect(await whoIs(next.cookie)).toMatchObject({ id: made!.id });
  });

  it('finds the account that has the address, connects the provider, and tells its owner', async () => {
    const email = anEmail();
    const owner = await signInByCode(email);
    const browser = aBrowser();
    const person = standInPerson('apple', { name: 'Ann Byrne', email });
    const back = await continueWith(person, { cookie: browser });
    expect(back.location.searchParams.get('error')).toBe('confirm_by_code');
    // Nothing is joined until the mailbox says yes.
    expect(await db().select().from(accounts).where(eq(accounts.userId, owner.userId))).toEqual([]);

    const { code } = await codeEmailedTo(email);
    const { response } = await enterCode(code, browser);
    expect(response).toMatchObject({
      result: 'correct',
      userId: owner.userId,
      method: 'apple',
      found: 'apple',
    });
    const ways = await db().select().from(accounts).where(eq(accounts.userId, owner.userId));
    expect(ways.map((way) => way.providerId)).toEqual(['apple']);
    expect(await signInChanges(owner.userId)).toEqual([
      expect.objectContaining({ change: 'added', method: 'apple' }),
    ]);
    // The email about a refused sign-in isn't sent as well: the code's own email said it.
    const refused = (await queuedJobs('send_account_email')).filter(
      (job) => job.kind === 'sign_in_refused' && job.userId === owner.userId,
    );
    expect(refused).toEqual([]);
  });

  it('joins nothing for the code entered in any other browser', async () => {
    const email = anEmail();
    const owner = await signInByCode(email);
    const person = standInPerson('google', { name: 'Ann Byrne', email, notHosted: true });
    await continueWith(person, { cookie: aBrowser() });
    const { code } = await codeEmailedTo(email);
    const { response } = await enterCode(code, aBrowser());
    expect(response).toEqual({ result: 'finished' });
    expect(await db().select().from(accounts).where(eq(accounts.userId, owner.userId))).toEqual([]);
  });

  it('never takes a provider account that is already someone else’s way in', async () => {
    const mine = anEmail();
    const theirs = anEmail();
    const other = await signInByCode(theirs);
    const me = await signInByCode(mine);
    // The provider account belongs to another person already.
    await db().insert(accounts).values({
      id: randomUUID(),
      providerId: 'google',
      accountId: 'held-by-another',
      userId: other.userId,
    });
    const asked = await askForCode(mine, null, {
      provider: { id: 'google', accountId: 'held-by-another' },
    });
    const { response } = await enterCode(asked.code, asked.cookie);
    // Signed in as themselves by the code, with nothing joined and nothing "found".
    expect(response).toMatchObject({ userId: me.userId, method: 'email_code', found: null });
    expect(await db().select().from(accounts).where(eq(accounts.userId, me.userId))).toEqual([]);
  });

  it('still says to use a code where none can be sent: a browser that never opened sign-in', async () => {
    const email = anEmail();
    const person = standInPerson('google', { name: 'Ann Byrne', email, notHosted: true });
    const back = await continueWith(person);
    expect(back.signedIn).toBe(false);
    expect(back.location.searchParams.get('error')).toBe('confirm_email_first');
  });

  it('never asks the mailbox for an address the provider says it never checked', async () => {
    const email = anEmail();
    const browser = aBrowser();
    const person = standInPerson('google', { name: 'Ann Byrne', email, unverified: true });
    const back = await continueWith(person, { cookie: browser });
    expect(back.location.searchParams.get('error')).toBe('email_not_verified');
    expect(await waitingCode('sign_in', key(browser))).toBeNull();
  });
});
