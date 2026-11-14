import { and, desc, eq, sql } from 'drizzle-orm';
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { db, withSystem } from '@/db/client';
import { devOutbox, passkeys, platformEvents, sessions, users } from '@/db/schema';
import { perAddress } from '@/domain/auth/limits';
import { auth } from '@/server/auth/auth';
import { addPassword, changePassword, signInWithPassword } from '@/server/auth/flows';
import { refusal } from '@/server/auth/limits';
import { needsRecentSignIn } from '@/server/auth/recent';
import { removePasskey, renamePasskey, signInOverview } from '@/server/auth/security';
import { staffAccessOf, staffPasskeyRequired } from '@/server/auth/staff';
import { connect, Jar, signInByCode } from './provider-helpers';
import {
  addSoftwarePasskey,
  APPLE_PASSWORDS,
  passkeyAnswer,
  passkeyChallenge,
  signInWithSoftwarePasskey,
} from './software-passkey';

const anEmail = () => `${crypto.randomUUID()}@passkeys.test.gaff.ie`;
const GOOD = 'the bins go out on tuesday';
const OTHER = 'a different sentence entirely';

async function sessionCount(userId: string): Promise<number> {
  return (await db().select().from(sessions).where(eq(sessions.userId, userId))).length;
}

async function latestSubjectTo(address: string): Promise<string> {
  const [latest] = await db()
    .select({ subject: devOutbox.subject })
    .from(devOutbox)
    .where(eq(devOutbox.toAddress, address))
    .orderBy(desc(devOutbox.createdAt), desc(devOutbox.id))
    .limit(1);
  return latest?.subject ?? '';
}

async function aSignedInPerson() {
  const email = anEmail();
  const jar = await signInByCode(email);
  const [user] = await db().select().from(users).where(eq(users.email, email));
  return { email, jar, userId: user!.id };
}

/** Makes every session of this person look as if it began this long ago. */
async function ageSessions(userId: string, minutes: number): Promise<void> {
  await db().execute(
    sql`update sessions set created_at = now() - make_interval(mins => ${minutes}) where user_id = ${userId}`,
  );
}

async function refusedBecause(call: Promise<unknown>): Promise<string> {
  try {
    await call;
    return 'allowed';
  } catch (error) {
    if (needsRecentSignIn(error)) return 'recent_sign_in_needed';
    return String((error as { body?: { code?: unknown } }).body?.code ?? (error as Error).message);
  }
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

async function passkeysOf(userId: string) {
  return db().select().from(passkeys).where(eq(passkeys.userId, userId));
}

describe('AU6, M6: passkeys', () => {
  it('offers a passkey that belongs to Gaff’s own site and needs no email to use', async () => {
    const { jar } = await aSignedInPerson();
    const options = await auth().api.generatePasskeyRegistrationOptions({
      headers: jar.headers(),
      query: {},
    });
    expect(options.rp).toEqual({ id: 'localhost', name: 'Gaff' });
    expect(options.authenticatorSelection).toMatchObject({
      residentKey: 'required',
      userVerification: 'preferred',
    });
    expect(options.challenge.length).toBeGreaterThan(20);
  });

  it('lets anyone ask to sign in with a passkey, and says nothing about who has one', async () => {
    const options = await auth().api.generatePasskeyAuthenticationOptions({
      headers: new Jar().headers(),
    });
    expect(options.rpId).toBe('localhost');
    expect(options.allowCredentials ?? []).toEqual([]);
    expect(options.userVerification).toBe('preferred');
  });

  it('won’t add a passkey for someone who isn’t signed in', async () => {
    expect(
      await refusedBecause(
        auth().api.generatePasskeyRegistrationOptions({ headers: new Jar().headers(), query: {} }),
      ),
    ).not.toBe('allowed');
  });
});

describe('AU6: adding a passkey and signing in with it', () => {
  it('adds a passkey, names it after what made it, records it and emails the owner', async () => {
    const { email, jar, userId } = await aSignedInPerson();
    await addSoftwarePasskey(jar, { madeBy: APPLE_PASSWORDS });

    const [kept] = await passkeysOf(userId);
    expect(kept).toMatchObject({ name: 'Apple Passwords', backedUp: true, counter: 0 });
    // Gaff holds the public half only: there's nothing here that could sign anyone in.
    expect(Object.keys(kept!).sort()).toEqual(
      [
        'aaguid',
        'backedUp',
        'counter',
        'createdAt',
        'credentialID',
        'deviceType',
        'id',
        'name',
        'publicKey',
        'transports',
        'userId',
      ].sort(),
    );
    expect(await eventsOf(userId)).toContainEqual({
      type: 'account.method_added',
      data: { method: 'passkey' },
    });
    expect(await latestSubjectTo(email)).toBe('A passkey was added to your Gaff account');

    const overview = await signInOverview(userId, 'no-session');
    expect(overview.passkeys).toMatchObject([{ name: 'Apple Passwords', kind: 'synced' }]);
  });

  it('calls it “Passkey” when the device doesn’t say what it is, and notes one that stays put', async () => {
    const { jar, userId } = await aSignedInPerson();
    await addSoftwarePasskey(jar, { synced: false });
    const overview = await signInOverview(userId, 'no-session');
    expect(overview.passkeys).toMatchObject([{ name: 'Passkey', kind: 'this_device' }]);
  });

  it('signs in with the passkey alone: no email, no password, no code', async () => {
    const { jar, userId } = await aSignedInPerson();
    const key = await addSoftwarePasskey(jar);

    const elsewhere = await signInWithSoftwarePasskey(key, new Jar());
    expect(elsewhere.signedIn).toBe(true);
    const session = await auth().api.getSession({ headers: elsewhere.headers() });
    expect(session?.user.id).toBe(userId);
    expect(session?.session).toMatchObject({ signInMethod: 'passkey' });
    expect((await eventsOf(userId)).at(-1)).toEqual({
      type: 'account.signed_in',
      data: { method: 'passkey' },
    });
  });

  it('refuses a passkey answer that was made for a look-alike site', async () => {
    const { jar, userId } = await aSignedInPerson();
    const key = await addSoftwarePasskey(jar);
    const before = await sessionCount(userId);

    // The page that asked was somewhere else: the address is part of what the passkey signs.
    for (const tampered of [{ origin: 'https://gaff-ie.example' }, { rpId: 'gaff-ie.example' }]) {
      const fresh = new Jar();
      expect(await refusedBecause(signInWithSoftwarePasskey(key, fresh, tampered))).toBe(
        'AUTHENTICATION_FAILED',
      );
      expect(fresh.signedIn).toBe(false);
    }
    expect(await sessionCount(userId)).toBe(before);
  });

  it('refuses an answer signed by any other key', async () => {
    const { jar } = await aSignedInPerson();
    const key = await addSoftwarePasskey(jar);
    const stranger = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
    const fresh = new Jar();
    expect(
      await refusedBecause(signInWithSoftwarePasskey(key, fresh, { signWith: stranger })),
    ).toBe('AUTHENTICATION_FAILED');
    expect(fresh.signedIn).toBe(false);
  });

  it('takes each challenge once, and only from the browser it was given to', async () => {
    const { jar } = await aSignedInPerson();
    const key = await addSoftwarePasskey(jar);

    const browser = new Jar();
    const challenge = await passkeyChallenge(browser);
    const answer = passkeyAnswer(key, challenge);
    const send = (from: Jar) =>
      refusedBecause(
        auth().api.verifyPasskeyAuthentication({
          body: { response: answer },
          headers: from.headers(),
        }),
      );
    // Someone who copied the answer, in a browser of their own.
    expect(await send(new Jar())).toBe('CHALLENGE_NOT_FOUND');
    expect(await send(browser)).toBe('allowed');
    // The same answer again.
    expect(await send(browser)).toBe('CHALLENGE_NOT_FOUND');
  });

  it('won’t make a passkey for a page on another site', async () => {
    const { jar, userId } = await aSignedInPerson();
    expect(
      await refusedBecause(addSoftwarePasskey(jar, { origin: 'https://gaff-ie.example' })),
    ).not.toBe('allowed');
    expect(await passkeysOf(userId)).toEqual([]);
    expect((await eventsOf(userId)).map((e) => e.type)).not.toContain('account.method_added');
  });

  it('renames a passkey, and removes one, which then signs nobody in', async () => {
    const { jar, userId } = await aSignedInPerson();
    const key = await addSoftwarePasskey(jar);
    const [kept] = await passkeysOf(userId);

    expect(await renamePasskey(kept!.id, '  Ann’s   phone ', jar.headers())).toBe('done');
    expect((await passkeysOf(userId))[0]).toMatchObject({ name: 'Ann’s phone' });
    expect(await renamePasskey(kept!.id, '   ', jar.headers())).toBe('not_found');

    expect(await removePasskey(kept!.id, jar.headers())).toBe('done');
    expect(await passkeysOf(userId)).toEqual([]);
    expect((await eventsOf(userId)).at(-1)).toEqual({
      type: 'account.method_removed',
      data: { method: 'passkey' },
    });
    expect(await refusedBecause(signInWithSoftwarePasskey(key, new Jar()))).toBe(
      'PASSKEY_NOT_FOUND',
    );
    expect(await removePasskey(kept!.id, jar.headers())).toBe('not_found');
  });

  it('keeps one person’s passkeys out of another’s hands', async () => {
    const owner = await aSignedInPerson();
    await addSoftwarePasskey(owner.jar);
    const [kept] = await passkeysOf(owner.userId);
    const other = await aSignedInPerson();

    expect(await renamePasskey(kept!.id, 'Mine now', other.jar.headers())).toBe('not_found');
    expect(await removePasskey(kept!.id, other.jar.headers())).toBe('not_found');
    expect(await removePasskey(kept!.id, new Jar().headers())).toBe('not_found');
    expect(await passkeysOf(owner.userId)).toHaveLength(1);
    expect((await passkeysOf(owner.userId))[0]!.name).not.toBe('Mine now');
  });

  it('asks to sign in again before removing a passkey, when the sign-in is over an hour old', async () => {
    const { jar, userId } = await aSignedInPerson();
    await addSoftwarePasskey(jar);
    const [kept] = await passkeysOf(userId);
    await ageSessions(userId, 61);
    expect(await removePasskey(kept!.id, jar.headers())).toBe('recent_sign_in_needed');
    expect(await passkeysOf(userId)).toHaveLength(1);
  });

  it('AU12: slows down passkey tries from one address', async () => {
    const { jar } = await aSignedInPerson();
    const key = await addSoftwarePasskey(jar);
    const stranger = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
    const address = crypto.randomUUID();
    const attempt = async () => {
      try {
        await signInWithSoftwarePasskey(key, new Jar(), { signWith: stranger, address });
        return 'allowed';
      } catch (error) {
        return refusal(error) ?? 'refused';
      }
    };
    for (let i = 0; i < perAddress.passkey.max; i += 1) expect(await attempt()).toBe('refused');
    expect(await attempt()).toBe('SLOW_DOWN');
  });
});

describe('AU7: changing how you sign in needs a sign-in in the last hour', () => {
  it('adds a passkey within the hour, and asks to sign in again after it', async () => {
    const { jar, userId } = await aSignedInPerson();
    const ask = () =>
      refusedBecause(
        auth().api.generatePasskeyRegistrationOptions({ headers: jar.headers(), query: {} }),
      );
    await ageSessions(userId, 59);
    expect(await ask()).toBe('allowed');
    await ageSessions(userId, 61);
    expect(await ask()).toBe('recent_sign_in_needed');
  });

  it('connects Google or Apple within the hour, and asks to sign in again after it', async () => {
    const { email, jar, userId } = await aSignedInPerson();
    await ageSessions(userId, 61);
    expect(
      await refusedBecause(
        auth().api.linkSocialAccount({
          body: { provider: 'google', callbackURL: '/account/security' },
          headers: jar.headers(),
        }),
      ),
    ).toBe('recent_sign_in_needed');
    await ageSessions(userId, 5);
    expect((await connect('google', { email }, jar)).error).toBeNull();
  });

  it('adds a first password within the hour, and asks to sign in again after it', async () => {
    const { email, jar, userId } = await aSignedInPerson();
    await ageSessions(userId, 61);
    expect(await addPassword(GOOD, jar.headers())).toBe('recent_sign_in_needed');
    await ageSessions(userId, 5);
    expect(await addPassword(GOOD, jar.headers())).toBe('done');
    expect(await signInWithPassword({ email, password: GOOD }, new Jar().headers())).toEqual({
      outcome: 'signed_in',
    });
    expect(await latestSubjectTo(email)).toBe('A password was added to your Gaff account');
  });

  it('holds a first password to the same rules as any other', async () => {
    const { email, jar } = await aSignedInPerson();
    expect(await addPassword('password1234', jar.headers())).toBe('breached');
    expect(await addPassword('too short', jar.headers())).toBe('too_short');
    expect(await addPassword(email, jar.headers())).toBe('is_email');
    expect(await addPassword(GOOD, new Jar().headers())).toBe('signed_out');
  });

  it('changes a password given the current one, signs other devices out, and emails the owner', async () => {
    const { email, jar, userId } = await aSignedInPerson();
    expect(await addPassword(GOOD, jar.headers())).toBe('done');
    const elsewhere = await signInByCode(email);
    expect(await sessionCount(userId)).toBe(2);

    expect(await changePassword({ current: 'not it at all', next: OTHER }, jar.headers())).toBe(
      'wrong_current',
    );
    expect(await changePassword({ current: GOOD, next: 'password1234' }, jar.headers())).toBe(
      'breached',
    );
    expect(await changePassword({ current: GOOD, next: OTHER }, jar.headers())).toBe('done');
    expect(await sessionCount(userId)).toBe(1);
    expect(await auth().api.getSession({ headers: elsewhere.headers() })).toBeNull();
    expect(await latestSubjectTo(email)).toBe('Your Gaff password was changed');
    expect(await signInWithPassword({ email, password: OTHER }, new Jar().headers())).toEqual({
      outcome: 'signed_in',
    });
  });
});

describe('M5: Gaff staff sign in with a passkey', () => {
  it('is asked of staff in production only: on the test copy, testers are staff', () => {
    expect(staffPasskeyRequired('production')).toBe(true);
    for (const copy of ['staging', 'test', 'development']) {
      expect(staffPasskeyRequired(copy)).toBe(false);
    }
  });

  it('never takes a browser’s word for how its session began', async () => {
    const { jar } = await aSignedInPerson();
    const sessionOf = async () => (await auth().api.getSession({ headers: jar.headers() }))!;
    await addSoftwarePasskey(jar);
    expect(await staffAccessOf(await sessionOf(), true)).toBe('needs_passkey_sign_in');

    // The library has a route for changing a session's own fields. This one isn't theirs to set.
    expect(
      await refusedBecause(
        auth().api.updateSession({
          body: { signInMethod: 'passkey' } as Record<string, unknown>,
          headers: jar.headers(),
        }),
      ),
    ).not.toBe('allowed');
    expect((await sessionOf()).session).toMatchObject({ signInMethod: 'email_code' });
    expect(await staffAccessOf(await sessionOf(), true)).toBe('needs_passkey_sign_in');
  });

  it('sends staff to add a passkey, then to sign in with it, and lets them in for 8 hours', async () => {
    const { jar, userId } = await aSignedInPerson();
    const sessionOf = async () => (await auth().api.getSession({ headers: jar.headers() }))!;

    // Signed in with a code, and no passkey yet.
    expect(await staffAccessOf(await sessionOf(), true)).toBe('needs_a_passkey');
    expect(await staffAccessOf(await sessionOf(), false)).toBe('allowed');

    // A passkey added, but this sign-in was still by code.
    const key = await addSoftwarePasskey(jar);
    expect(await staffAccessOf(await sessionOf(), true)).toBe('needs_passkey_sign_in');

    await signInWithSoftwarePasskey(key, jar);
    expect(await staffAccessOf(await sessionOf(), true)).toBe('allowed');

    // A working day later, the passkey is asked for again.
    await ageSessions(userId, 8 * 60 + 1);
    expect(await staffAccessOf(await sessionOf(), true)).toBe('needs_passkey_sign_in');
  });
});
