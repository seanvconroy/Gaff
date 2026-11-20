import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { standInPerson } from '@/adapters/sign-in/stand-in';
import { db, withPerson } from '@/db/client';
import {
  accounts,
  devOutbox,
  oneTimeCodes,
  profileEvents,
  sessions,
  signInMobiles,
  users,
} from '@/db/schema';
import { TEXTS_PER_WINDOW } from '@/domain/auth/codes';
import { MOBILE_VOUCHES_DAYS, PROVEN_MOBILE_MINUTES } from '@/domain/auth/mobile';
import { sendCode, waitingCode } from '@/server/auth/codes';
import { ConfirmationNeeded, findConfirmation, grantConfirmation } from '@/server/auth/confirm';
import { cookieNames } from '@/server/auth/cookies';
import {
  joinMobile,
  mobileNeedingEmail as provenMobile,
  mobileSignIn,
  signInMobileOf,
  textBudgetSpent,
  textSent,
} from '@/server/auth/mobile';
import { removeSignInMobile, signInOverview } from '@/server/auth/security';
import { queuedJobs } from './helpers';
import {
  aMobile,
  askForCode,
  askForText,
  codeEmailedTo,
  continueWith,
  enterCode,
  signInByCode,
  whoIs,
} from './sign-in-helpers';

// The stand-ins for Google and Apple, and for texts, are there only with the development tools
// on, locally and in tests.
vi.hoisted(() => {
  process.env.DEV_TOOLS = '1';
  process.env.GAFF_ENV = 'test';
});

/**
 * UX-SI-13 to UX-SI-15 (ADR-0032): signing in with a mobile number, and one person however they
 * sign in. The real Better Auth runs against the test database; texts go to the outbox, and
 * Google and Apple are the stand-ins.
 */
const anEmail = () => `${randomUUID()}@mobile.test.gaff.ie`;
const DAY_MS = 24 * 60 * 60 * 1000;

const usersWith = (email: string) => db().select().from(users).where(eq(users.email, email));
const mobileRow = async (mobile: string) =>
  (await db().select().from(signInMobiles).where(eq(signInMobiles.mobile, mobile)))[0] ?? null;
const newestSession = async (userId: string) =>
  (
    await db()
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.createdAt))
      .limit(1)
  )[0]!;
const signInChanges = async (userId: string) =>
  (await queuedJobs('send_account_email')).filter(
    (job) => job.kind === 'sign_in_changed' && job.userId === userId,
  );
const key = (cookie: string) => cookie.split('=')[1]!;

/** The whole of UX-SI-14: proves a number by text, then the email that goes with it. */
async function signInWithNewMobile(mobile: string, email: string) {
  const text = await askForText(mobile);
  const proved = await enterCode(text.code, text.cookie);
  expect(proved.response).toEqual({ result: 'email_needed' });
  const proven = await provenMobile(text.browserKey);
  expect(proven?.mobile).toBe(mobile);
  const emailed = await askForCode(email, text.browserKey, { mobile });
  return enterCode(emailed.code, emailed.cookie);
}

describe('UX-SI-13: a code by text', () => {
  it('is offered locally and in tests as a stand-in, and the text goes to the outbox', async () => {
    expect(mobileSignIn()).toBe('stand_in');
    const mobile = aMobile();
    const { code } = await askForText(mobile);
    const [text] = await db()
      .select()
      .from(devOutbox)
      .where(eq(devOutbox.toAddress, mobile))
      .orderBy(desc(devOutbox.createdAt));
    expect(text?.text).toBe(
      `Your code to sign in to Gaff is ${code}. It works for 10 minutes. Never share it with anyone.\n\n@gaff.test #${code}`,
    );
  });

  it('keeps the number’s code as a hash, with no button, marked as a text', async () => {
    const mobile = aMobile();
    const { code } = await askForText(mobile);
    const [row] = await db().select().from(oneTimeCodes).where(eq(oneTimeCodes.subject, mobile));
    expect(row).toMatchObject({ channel: 'sms', linkHash: null, joining: null });
    expect(JSON.stringify(row)).not.toContain(code);
  });

  it('sends a number three texts in ten minutes, and no more', async () => {
    const mobile = aMobile();
    const start = Date.now() - 9 * 60_000;
    let browserKey: string | null = null;
    for (let sent = 0; sent < TEXTS_PER_WINDOW; sent += 1) {
      const asked = await askForText(mobile, browserKey, new Date(start + sent * 60_000));
      browserKey = asked.browserKey;
    }
    const fourth = await sendCode({
      purpose: 'sign_in',
      subject: mobile,
      to: mobile,
      channel: 'sms',
      browserKey,
      text: () => 'not sent',
    });
    expect(fourth).toEqual({ sent: false, reason: 'too_many' });
  });

  it('signs nobody in, and makes nobody, for a number nobody has: the email comes next', async () => {
    const mobile = aMobile();
    const text = await askForText(mobile);
    const proved = await enterCode(text.code, text.cookie);
    expect(proved.response).toEqual({ result: 'email_needed' });
    expect(proved.cookie).not.toContain('session_token');
    expect(await mobileRow(mobile)).toBeNull();
    // The number stands proven for this browser, and for no other.
    expect(await provenMobile(text.browserKey)).toMatchObject({ mobile });
    expect(await provenMobile('b'.repeat(43))).toBeNull();
  });

  it('signs nobody in for a wrong code, or the right code from another browser', async () => {
    const mobile = aMobile();
    const { userId } = await signInWithNewMobile(mobile, anEmail()).then(
      (r) => r.response as never,
    );
    expect(userId).toBeTruthy();
    const text = await askForText(mobile);
    const wrong = await enterCode(text.code === '111111' ? '222222' : '111111', text.cookie);
    expect(wrong.response).toEqual({ result: 'wrong' });
    expect(wrong.cookie).not.toContain('session_token');
    const elsewhere = await enterCode(text.code, `${cookieNames.signInCode}=${'c'.repeat(43)}`);
    expect(elsewhere.response).toEqual({ result: 'finished' });
    expect(elsewhere.cookie).not.toContain('session_token');
  });

  it('signs its owner in from then on, and the session says it was by text', async () => {
    const mobile = aMobile();
    const email = anEmail();
    const first = await signInWithNewMobile(mobile, email);
    expect(first.response).toMatchObject({ result: 'correct' });
    const before = (await mobileRow(mobile))!.provenAt;

    const text = await askForText(mobile);
    const back = await enterCode(text.code, text.cookie);
    expect(back.response).toMatchObject({ result: 'correct', method: 'sms_code', found: null });
    const who = await whoIs(back.cookie);
    expect(who).toMatchObject({ email });
    expect((await newestSession(who!.id)).signInMethod).toBe('sms_code');
    // Each sign-in by text is fresh proof that the number is still theirs.
    expect((await mobileRow(mobile))!.provenAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    // Who is signed in says nothing of the number.
    expect(JSON.stringify(who)).not.toContain(mobile);
  });
});

describe('UX-SI-14: the email that goes with a new mobile number', () => {
  it('makes a person for an email nobody has, with the number as a way in', async () => {
    const mobile = aMobile();
    const email = anEmail();
    const { response, cookie } = await signInWithNewMobile(mobile, email);
    // They chose their mobile; nothing was found, so they go straight on to set up.
    expect(response).toMatchObject({ result: 'correct', method: 'sms_code', found: null });
    const [person] = await usersWith(email);
    expect(person).toMatchObject({ emailVerified: true });
    expect(await mobileRow(mobile)).toMatchObject({ userId: person!.id });
    expect(await whoIs(cookie)).toMatchObject({ id: person!.id });
    // The session records the proof that made it: the code by email.
    expect((await newestSession(person!.id)).signInMethod).toBe('email_code');
    // An account made a moment ago has no change to be told about.
    expect(await signInChanges(person!.id)).toEqual([]);
  });

  it('finds the account that has the email, however it was made, and joins the number', async () => {
    const email = anEmail();
    // Signed up with Google, some time ago.
    const google = await continueWith(standInPerson('google', { name: 'Ann Byrne', email }));
    const owner = (await whoIs(google.cookie))!;

    const mobile = aMobile();
    const { response, cookie } = await signInWithNewMobile(mobile, email);
    expect(response).toMatchObject({
      result: 'correct',
      userId: owner.id,
      method: 'sms_code',
      // "We've found your account".
      found: 'mobile',
    });
    expect(await usersWith(email)).toHaveLength(1);
    expect(await whoIs(cookie)).toMatchObject({ id: owner.id });
    expect(await signInMobileOf(owner.id)).toBe(mobile);
    // Google is still one of their ways in, and the next text signs them straight in.
    const ways = await db().select().from(accounts).where(eq(accounts.userId, owner.id));
    expect(ways.map((way) => way.providerId)).toEqual(['google']);
    const text = await askForText(mobile);
    expect((await enterCode(text.code, text.cookie)).response).toMatchObject({ userId: owner.id });
  });

  it('tells the account’s owner a number was added, and writes it to their record', async () => {
    const email = anEmail();
    const owner = await signInByCode(email);
    await signInWithNewMobile(aMobile(), email);
    expect(await signInChanges(owner.userId)).toEqual([
      {
        kind: 'sign_in_changed',
        userId: owner.userId,
        change: 'added',
        method: 'mobile',
        at: expect.any(String),
      },
    ]);
    const steps = await withPerson(owner.userId, (tx) =>
      tx
        .select()
        .from(profileEvents)
        .where(
          and(
            eq(profileEvents.userId, owner.userId),
            eq(profileEvents.type, 'profile.sign_in_added'),
          ),
        ),
    );
    // Rule 8: the step names the kind of way in, and never the number.
    expect(steps.map((step) => step.data)).toEqual([{ method: 'mobile' }]);
  });

  it('joins nothing for an email code that carries nothing', async () => {
    const mobile = aMobile();
    const email = anEmail();
    const text = await askForText(mobile);
    await enterCode(text.code, text.cookie);
    // The same browser signs in by email in the ordinary way instead.
    const plain = await askForCode(email, text.browserKey);
    const { response } = await enterCode(plain.code, plain.cookie);
    expect(response).toMatchObject({ result: 'correct', method: 'email_code', found: null });
    expect(await mobileRow(mobile)).toBeNull();
    // And the number's turn is over.
    expect(await provenMobile(text.browserKey)).toBeNull();
  });

  it('gives the browser 15 minutes to put an email to the number', async () => {
    const text = await askForText(aMobile());
    await enterCode(text.code, text.cookie);
    const later = new Date(Date.now() + (PROVEN_MOBILE_MINUTES + 1) * 60_000);
    expect(await provenMobile(text.browserKey, later)).toBeNull();
  });

  it('keeps the number proven while the email code that carries it is waiting', async () => {
    const mobile = aMobile();
    const text = await askForText(mobile);
    await enterCode(text.code, text.cookie);
    const emailed = await askForCode(anEmail(), text.browserKey, { mobile });
    // "Use a different email" comes back to the question, and the number is still there.
    expect(await provenMobile(text.browserKey)).toMatchObject({ mobile });
    await enterCode(emailed.code, emailed.cookie);
    expect(await provenMobile(text.browserKey)).toBeNull();
  });

  it('a person has one number: a new one replaces the old', async () => {
    const email = anEmail();
    const first = aMobile();
    const second = aMobile();
    await signInWithNewMobile(first, email);
    const { response } = await signInWithNewMobile(second, email);
    expect(response).toMatchObject({ found: 'mobile' });
    const [person] = await usersWith(email);
    expect(await signInMobileOf(person!.id)).toBe(second);
    expect(await mobileRow(first)).toBeNull();
  });
});

describe('UX-SI-14: a number vouches for its owner for 180 days', () => {
  it('asks a number unused for 180 days for its email again, and stays with the same person', async () => {
    const mobile = aMobile();
    const email = anEmail();
    await signInWithNewMobile(mobile, email);
    const [person] = await usersWith(email);
    await db()
      .update(signInMobiles)
      .set({ provenAt: new Date(Date.now() - (MOBILE_VOUCHES_DAYS + 1) * DAY_MS) })
      .where(eq(signInMobiles.mobile, mobile));

    const text = await askForText(mobile);
    const proved = await enterCode(text.code, text.cookie);
    expect(proved.response).toEqual({ result: 'email_needed' });
    expect(proved.cookie).not.toContain('session_token');

    const emailed = await askForCode(email, text.browserKey, { mobile });
    const { response } = await enterCode(emailed.code, emailed.cookie);
    expect(response).toMatchObject({ result: 'correct', userId: person!.id, found: 'mobile' });
    // Proven again: the next text signs them straight in.
    const again = await askForText(mobile);
    expect((await enterCode(again.code, again.cookie)).response).toMatchObject({
      result: 'correct',
      method: 'sms_code',
    });
  });

  it('moves a number that has a new holder to them, and tells the person it left', async () => {
    const mobile = aMobile();
    const before = anEmail();
    await signInWithNewMobile(mobile, before);
    const [previous] = await usersWith(before);
    await db()
      .update(signInMobiles)
      .set({ provenAt: new Date(Date.now() - (MOBILE_VOUCHES_DAYS + 1) * DAY_MS) })
      .where(eq(signInMobiles.mobile, mobile));

    // The phone company has given the number to someone else, who has their own email.
    const holder = anEmail();
    const { response, cookie } = await signInWithNewMobile(mobile, holder);
    const [next] = await usersWith(holder);
    expect(response).toMatchObject({ result: 'correct', userId: next!.id });
    expect(next!.id).not.toBe(previous!.id);
    expect(await whoIs(cookie)).toMatchObject({ email: holder });
    expect(await mobileRow(mobile)).toMatchObject({ userId: next!.id });
    expect(await signInMobileOf(previous!.id)).toBeNull();
    expect(await signInChanges(previous!.id)).toEqual([
      expect.objectContaining({ change: 'removed', method: 'mobile' }),
    ]);
  });

  it('never lets a number that still vouches for someone be taken by proving another email', async () => {
    const mobile = aMobile();
    const email = anEmail();
    await signInWithNewMobile(mobile, email);
    const [owner] = await usersWith(email);
    // The number signs its owner in: there is no asking for an email to hang it on.
    const text = await askForText(mobile);
    const { response } = await enterCode(text.code, text.cookie);
    expect(response).toMatchObject({ result: 'correct', userId: owner!.id });
    expect(await provenMobile(text.browserKey)).toBeNull();
  });
});

describe('UX-SI-13: the hour’s budget of texts', () => {
  it('pauses sign-in by mobile once the hour’s texts are sent, and not before', async () => {
    const hour = new Date('2031-03-03T10:00:00Z');
    const budget = 300;
    expect(await textBudgetSpent(hour)).toBe(false);
    for (let sent = 0; sent < budget; sent += 100) {
      // Counted a hundred at a time: the same counter the limiter uses.
      const { countTry } = await import('@/server/auth/limits');
      await countTry('texts', 'sign_in', 60 * 60, hour, 99);
      await textSent(hour);
    }
    expect(await textBudgetSpent(hour)).toBe(true);
    // The next hour starts again.
    expect(await textBudgetSpent(new Date(hour.getTime() + 61 * 60_000))).toBe(false);
  });
});

describe('UX-SI-13: the mobile number on “How you sign in”', () => {
  it('shows the person their number, and removes it once they confirm it’s them', async () => {
    const mobile = aMobile();
    const email = anEmail();
    await signInWithNewMobile(mobile, email);
    const [person] = await usersWith(email);
    expect((await signInOverview(person!.id, null)).mobile).toBe(mobile);

    await expect(removeSignInMobile(person!.id, null)).rejects.toBeInstanceOf(ConfirmationNeeded);
    expect(await signInMobileOf(person!.id)).toBe(mobile);

    const grant = await grantConfirmation(person!.id, 'change_sign_in', 'email_code');
    const confirmation = await findConfirmation(person!.id, 'change_sign_in', grant);
    expect(await removeSignInMobile(person!.id, confirmation)).toBe('done');
    expect(await signInMobileOf(person!.id)).toBeNull();
    expect((await signInOverview(person!.id, null)).mobile).toBeNull();
    expect(await signInChanges(person!.id)).toEqual([
      expect.objectContaining({ change: 'removed', method: 'mobile' }),
    ]);
    // The number gets nobody in now: its next holder is asked for their email.
    const text = await askForText(mobile);
    expect((await enterCode(text.code, text.cookie)).response).toEqual({ result: 'email_needed' });
    expect(await removeSignInMobile(person!.id, null)).toBe('not_found');
  });

  it('joining the number a person already has changes nothing, and tells nobody', async () => {
    const mobile = aMobile();
    const email = anEmail();
    await signInWithNewMobile(mobile, email);
    const [person] = await usersWith(email);
    expect(await joinMobile(person!.id, mobile)).toBe('already');
    expect(await signInChanges(person!.id)).toEqual([]);
  });

  it('goes with the person when their account is deleted', async () => {
    const mobile = aMobile();
    const email = anEmail();
    await signInWithNewMobile(mobile, email);
    const [person] = await usersWith(email);
    await db().delete(users).where(eq(users.id, person!.id));
    expect(await mobileRow(mobile)).toBeNull();
  });
});

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
      channel: 'email',
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
