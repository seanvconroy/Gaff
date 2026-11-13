import { and, desc, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withSystem } from '@/db/client';
import { accounts, devOutbox, platformEvents, sessions, users } from '@/db/schema';
import { PASSWORD_FAILURES } from '@/domain/auth/limits';
import {
  confirmEmail,
  createAccount,
  requestPasswordReset,
  resendConfirmCode,
  resetPassword,
  sendSignInCode,
  signInWithCode,
  signInWithPassword,
} from '@/server/auth/flows';

/** Each call comes "from" its own made-up address, so tests never share a limit. */
const from = (address = crypto.randomUUID()) => new Headers({ 'x-forwarded-for': address });
const anEmail = () => `${crypto.randomUUID()}@accounts.test.gaff.ie`;
const GOOD = 'the bins go out on tuesday';
const OTHER = 'a different sentence entirely';

async function emailsTo(address: string) {
  return db()
    .select({ subject: devOutbox.subject, text: devOutbox.text })
    .from(devOutbox)
    .where(eq(devOutbox.toAddress, address))
    .orderBy(desc(devOutbox.createdAt), desc(devOutbox.id));
}

async function latestCode(address: string): Promise<string> {
  const [latest] = await emailsTo(address);
  const code = latest?.subject.match(/\b\d{6}\b/)?.[0];
  if (!code) throw new Error(`No code was sent to ${address}`);
  return code;
}

const wrongCodeFor = (code: string) => (code === '000000' ? '111111' : '000000');

async function userFor(email: string) {
  const [user] = await db().select().from(users).where(eq(users.email, email));
  return user ?? null;
}

async function waysIn(userId: string) {
  const rows = await db()
    .select({ providerId: accounts.providerId })
    .from(accounts)
    .where(eq(accounts.userId, userId));
  return rows.map((r) => r.providerId).sort();
}

async function sessionsOf(userId: string) {
  return db().select().from(sessions).where(eq(sessions.userId, userId));
}

async function eventsAbout(userId: string) {
  const rows = await withSystem((tx) =>
    tx
      .select({ type: platformEvents.type, data: platformEvents.data })
      .from(platformEvents)
      .where(and(eq(platformEvents.subjectType, 'user'), eq(platformEvents.subjectId, userId)))
      .orderBy(platformEvents.id),
  );
  return rows;
}

/** A confirmed account with a password, made the way a person makes one. */
async function aConfirmedAccount(email = anEmail(), password = GOOD) {
  const created = await createAccount({ email, password }, from());
  if (!created.ok) throw new Error(`sign-up refused: ${created.problem}`);
  const code = await latestCode(email);
  expect(await confirmEmail({ email, userId: created.userId, code }, from())).toBe('confirmed');
  return { email, password, userId: created.userId };
}

describe('AU1, AU2: creating an account with a password', () => {
  it('makes an account nobody can use until a code confirms its email', async () => {
    const email = anEmail();
    const created = await createAccount({ email, password: GOOD }, from());
    expect(created.ok).toBe(true);
    const user = await userFor(email);
    expect(user).toMatchObject({ emailVerified: false });
    expect(await waysIn(user!.id)).toEqual(['credential']);
    expect(await sessionsOf(user!.id)).toEqual([]);

    const [sent] = await emailsTo(email);
    expect(sent!.subject).toMatch(/^\d{6} is your code to finish setting up Gaff$/);

    // The right password isn't enough yet: it's told to confirm, and a new code goes out.
    const early = await signInWithPassword({ email, password: GOOD }, from());
    expect(early).toEqual({ outcome: 'unconfirmed', userId: user!.id });
    expect(await sessionsOf(user!.id)).toEqual([]);
    expect(await emailsTo(email)).toHaveLength(2);
  });

  it('confirms with the code, signs in, and the password works from then on', async () => {
    const { email, userId } = await aConfirmedAccount();
    expect(await userFor(email)).toMatchObject({ emailVerified: true });
    const [session] = await sessionsOf(userId);
    expect(session).toMatchObject({ signInMethod: 'email_code' });
    expect(await signInWithPassword({ email, password: GOOD }, from())).toEqual({
      outcome: 'signed_in',
    });
    const methods = (await sessionsOf(userId)).map((s) => s.signInMethod).sort();
    expect(methods).toEqual(['email_code', 'password']);
  });

  it('stores the password hashed, never as typed', async () => {
    const { userId } = await aConfirmedAccount();
    const [row] = await db()
      .select({ password: accounts.password })
      .from(accounts)
      .where(eq(accounts.userId, userId));
    expect(row!.password).toBeTruthy();
    expect(row!.password).not.toContain(GOOD);
  });

  it('refuses a wrong code, and after 5 wrong tries the code is spent', async () => {
    const email = anEmail();
    const created = await createAccount({ email, password: GOOD }, from());
    if (!created.ok) throw new Error('sign-up refused');
    const code = await latestCode(email);
    for (let i = 0; i < 5; i++) {
      expect(
        await confirmEmail({ email, userId: created.userId, code: wrongCodeFor(code) }, from()),
      ).toBe('wrong_code');
    }
    expect(await confirmEmail({ email, userId: created.userId, code }, from())).toBe('wrong_code');
    expect(await userFor(email)).toMatchObject({ emailVerified: false });

    // A new code works.
    expect(await resendConfirmCode({ email, userId: created.userId }, from())).toBe('sent');
    const fresh = await latestCode(email);
    expect(await confirmEmail({ email, userId: created.userId, code: fresh }, from())).toBe(
      'confirmed',
    );
  });

  it('answers a second sign-up for a confirmed address the same way, and emails the owner', async () => {
    const { email, userId } = await aConfirmedAccount();
    const before = (await emailsTo(email)).length;

    const again = await createAccount({ email, password: OTHER }, from());
    expect(again.ok).toBe(true);
    // The same shape as a first sign-up, but for nobody: no new account, and no code.
    expect(again.ok && again.userId).not.toBe(userId);
    expect((await userFor(email))!.id).toBe(userId);
    const sent = await emailsTo(email);
    expect(sent).toHaveLength(before + 1);
    expect(sent[0]!.subject).toBe('You already have a Gaff account');
    expect(sent[0]!.text).toContain('/sign-in');
    expect(sent[0]!.text).toContain('/forgot-password');

    // The password is unchanged, and whoever tried can't confirm anything.
    expect(await signInWithPassword({ email, password: OTHER }, from())).toEqual({
      outcome: 'wrong',
    });
    expect(await signInWithPassword({ email, password: GOOD }, from())).toEqual({
      outcome: 'signed_in',
    });
    if (again.ok) {
      expect(await confirmEmail({ email, userId: again.userId, code: '123456' }, from())).toBe(
        'wrong_code',
      );
      expect(await resendConfirmCode({ email, userId: again.userId }, from())).toBe('sent');
      expect(await emailsTo(email)).toHaveLength(before + 1);
    }
  });

  it('AU4: replaces a sign-up nobody confirmed, so a stranger’s password never survives', async () => {
    const email = anEmail();
    // A stranger registers someone else's address and can't confirm it.
    const strangers = await createAccount({ email, password: OTHER }, from());
    if (!strangers.ok) throw new Error('sign-up refused');

    // The owner signs up themselves.
    const owners = await createAccount({ email, password: GOOD }, from());
    if (!owners.ok) throw new Error('sign-up refused');
    expect(owners.userId).not.toBe(strangers.userId);
    expect((await userFor(email))!.id).toBe(owners.userId);

    const code = await latestCode(email);
    // The stranger's browser can't use the owner's code: it belongs to the owner's sign-up.
    expect(await confirmEmail({ email, userId: strangers.userId, code }, from())).toBe(
      'wrong_code',
    );
    expect(await confirmEmail({ email, userId: undefined, code }, from())).toBe('wrong_code');
    expect(await confirmEmail({ email, userId: owners.userId, code }, from())).toBe('confirmed');

    expect(await signInWithPassword({ email, password: OTHER }, from())).toEqual({
      outcome: 'wrong',
    });
    expect(await signInWithPassword({ email, password: GOOD }, from())).toEqual({
      outcome: 'signed_in',
    });
  });

  it('refuses a short password, the email itself, and one from a data breach', async () => {
    const email = anEmail();
    expect(await createAccount({ email, password: 'too short' }, from())).toEqual({
      ok: false,
      problem: 'too_short',
    });
    expect(await createAccount({ email, password: email }, from())).toEqual({
      ok: false,
      problem: 'is_email',
    });
    expect(await createAccount({ email, password: 'a'.repeat(129) }, from())).toEqual({
      ok: false,
      problem: 'too_long',
    });
    expect(await createAccount({ email, password: 'password1234' }, from())).toEqual({
      ok: false,
      problem: 'breached',
    });
    expect(await userFor(email)).toBeNull();
    // Refused passwords don't use up the tries at signing up: a good one still goes through.
    expect((await createAccount({ email, password: GOOD }, from())).ok).toBe(true);
  });

  it('AU12: limits how fast one address can have passwords checked against breaches', async () => {
    const address = from();
    for (let i = 0; i < 20; i++) {
      expect(await createAccount({ email: anEmail(), password: 'password1234' }, address)).toEqual({
        ok: false,
        problem: 'breached',
      });
    }
    expect(await createAccount({ email: anEmail(), password: 'password1234' }, address)).toEqual({
      ok: false,
      problem: 'slow_down',
    });
  });

  it('AU16: records how the account was made and each sign-in, with no personal data', async () => {
    const { email, userId } = await aConfirmedAccount();
    await signInWithPassword({ email, password: GOOD }, from());
    const events = await eventsAbout(userId);
    expect(events.map((e) => e.type)).toEqual([
      'account.signed_up',
      'account.signed_in',
      'account.email_confirmed',
      'account.signed_in',
    ]);
    expect(events[0]!.data).toEqual({ method: 'password' });
    expect(events[1]!.data).toEqual({ method: 'email_code' });
    expect(events[3]!.data).toEqual({ method: 'password' });
    expect(JSON.stringify(events)).not.toContain(email);
  });
});

describe('AU3: signing in with a code or a password', () => {
  it('signs a new address in with a code, which makes its account, already confirmed', async () => {
    const email = anEmail();
    expect(await sendSignInCode(email, from())).toBe('sent');
    const [sent] = await emailsTo(email);
    expect(sent!.subject).toMatch(/^\d{6} is your Gaff code$/);
    expect(await signInWithCode({ email, code: await latestCode(email) }, from())).toBe(
      'signed_in',
    );
    const user = await userFor(email);
    expect(user).toMatchObject({ emailVerified: true });
    expect(await waysIn(user!.id)).toEqual([]);
    expect((await sessionsOf(user!.id))[0]).toMatchObject({ signInMethod: 'email_code' });
  });

  it('signs an existing account in with a code, and refuses a wrong one', async () => {
    const { email, userId } = await aConfirmedAccount();
    await sendSignInCode(email, from());
    const code = await latestCode(email);
    expect(await signInWithCode({ email, code: wrongCodeFor(code) }, from())).toBe('wrong_code');
    expect(await signInWithCode({ email, code }, from())).toBe('signed_in');
    // A code works once.
    expect(await signInWithCode({ email, code }, from())).toBe('wrong_code');
    expect((await userFor(email))!.id).toBe(userId);
  });

  it('gives the same answer for a wrong password and an address with no account', async () => {
    const { email } = await aConfirmedAccount();
    expect(await signInWithPassword({ email, password: OTHER }, from())).toEqual({
      outcome: 'wrong',
    });
    expect(await signInWithPassword({ email: anEmail(), password: OTHER }, from())).toEqual({
      outcome: 'wrong',
    });
  });

  it('AU4: a code signs in to an unconfirmed account by dropping its unproven password', async () => {
    const email = anEmail();
    // A stranger registers the address with their own password.
    const strangers = await createAccount({ email, password: OTHER }, from());
    if (!strangers.ok) throw new Error('sign-up refused');
    // The owner asks for a code instead, and signs in with it.
    await sendSignInCode(email, from());
    expect(await signInWithCode({ email, code: await latestCode(email) }, from())).toBe(
      'signed_in',
    );
    const user = await userFor(email);
    expect(user).toMatchObject({ emailVerified: true });
    expect(await waysIn(user!.id)).toEqual([]);
    expect(await signInWithPassword({ email, password: OTHER }, from())).toEqual({
      outcome: 'wrong',
    });
  });

  it('AU12: pauses password sign-in for an email after 10 wrong passwords, and codes still work', async () => {
    const { email } = await aConfirmedAccount();
    // From ten different addresses: one address is stopped sooner, by its own limit.
    for (let i = 0; i < PASSWORD_FAILURES.max; i++) {
      expect(await signInWithPassword({ email, password: OTHER }, from())).toEqual({
        outcome: 'wrong',
      });
    }
    // Even the right password waits now.
    expect(await signInWithPassword({ email, password: GOOD }, from())).toEqual({
      outcome: 'paused',
    });
    // Nobody is locked out: a code still gets the owner in.
    await sendSignInCode(email, from());
    expect(await signInWithCode({ email, code: await latestCode(email) }, from())).toBe(
      'signed_in',
    );
    // Once the 15 minutes are over, the password works again, and getting in clears the count.
    await db().execute(
      sql`update auth_limits set window_started_at = now() - interval '16 minutes'
          where hits >= ${PASSWORD_FAILURES.max} and window_started_at > now() - interval '1 minute'`,
    );
    expect(await signInWithPassword({ email, password: GOOD }, from())).toEqual({
      outcome: 'signed_in',
    });
  });

  it('AU12: counts wrong passwords for an address with no account too, so the pause tells nothing', async () => {
    const email = anEmail();
    for (let i = 0; i < PASSWORD_FAILURES.max; i++) {
      await signInWithPassword({ email, password: OTHER }, from());
    }
    expect(await signInWithPassword({ email, password: OTHER }, from())).toEqual({
      outcome: 'paused',
    });
    expect(await userFor(email)).toBeNull();
  });

  it('AU12: stops one address after 5 passwords a minute, whoever they’re for', async () => {
    const address = from();
    for (let i = 0; i < 5; i++) {
      expect(await signInWithPassword({ email: anEmail(), password: OTHER }, address)).toEqual({
        outcome: 'wrong',
      });
    }
    expect(await signInWithPassword({ email: anEmail(), password: OTHER }, address)).toEqual({
      outcome: 'slow_down',
    });
  });
});

describe('AU5: resetting a forgotten password', () => {
  it('says the same, and sends nothing, for an address with no account', async () => {
    const email = anEmail();
    expect(await requestPasswordReset(email, from())).toBe('sent');
    expect(await emailsTo(email)).toEqual([]);
  });

  it('sets a new password with the code, signs every other device out, and emails the owner', async () => {
    const { email, userId } = await aConfirmedAccount();
    await signInWithPassword({ email, password: GOOD }, from());
    expect((await sessionsOf(userId)).length).toBe(2);

    expect(await requestPasswordReset(email, from())).toBe('sent');
    const [sent] = await emailsTo(email);
    expect(sent!.subject).toMatch(/^\d{6} is your code to reset your Gaff password$/);
    const code = await latestCode(email);

    expect(await resetPassword({ email, code, password: OTHER }, from())).toBe('reset');
    // Only the session this reset began is left.
    const left = await sessionsOf(userId);
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ signInMethod: 'password' });
    expect((await emailsTo(email))[0]!.subject).toBe('Your Gaff password was changed');

    expect(await signInWithPassword({ email, password: GOOD }, from())).toEqual({
      outcome: 'wrong',
    });
    expect(await signInWithPassword({ email, password: OTHER }, from())).toEqual({
      outcome: 'signed_in',
    });
    expect((await eventsAbout(userId)).map((e) => e.type)).toContain('account.password_changed');
  });

  it('refuses a wrong code and a breached password, and the code still works afterwards', async () => {
    const { email } = await aConfirmedAccount();
    await requestPasswordReset(email, from());
    const code = await latestCode(email);
    expect(await resetPassword({ email, code: wrongCodeFor(code), password: OTHER }, from())).toBe(
      'wrong_code',
    );
    expect(await resetPassword({ email, code, password: 'password1234' }, from())).toBe('breached');
    expect(await resetPassword({ email, code, password: 'short' }, from())).toBe('too_short');
    expect(await resetPassword({ email, code, password: OTHER }, from())).toBe('reset');
  });

  it('gives a password to someone who only ever signed in with a code', async () => {
    const email = anEmail();
    await sendSignInCode(email, from());
    await signInWithCode({ email, code: await latestCode(email) }, from());
    const user = await userFor(email);
    expect(await waysIn(user!.id)).toEqual([]);

    await requestPasswordReset(email, from());
    expect(
      await resetPassword({ email, code: await latestCode(email), password: GOOD }, from()),
    ).toBe('reset');
    expect(await waysIn(user!.id)).toEqual(['credential']);
  });
});
