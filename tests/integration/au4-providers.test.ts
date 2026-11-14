import { and, desc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withSystem } from '@/db/client';
import { accounts, devOutbox, platformEvents, sessions, users } from '@/db/schema';
import { createAccount, signInWithPassword } from '@/server/auth/flows';
import { standInIdentity } from '@/server/auth/stand-in-provider';
import { connect, continueWith, Jar, signInByCode } from './provider-helpers';

const tag = () => crypto.randomUUID().slice(0, 8);
const gmail = () => `ann.${tag()}@gmail.com`;
const work = () => `ann@halcyon-${tag()}.test`;
const from = () => new Headers({ 'x-forwarded-for': crypto.randomUUID() });
const GOOD = 'the bins go out on tuesday';

async function userFor(email: string) {
  const [user] = await db().select().from(users).where(eq(users.email, email));
  return user ?? null;
}

async function accountsOf(userId: string) {
  return db().select().from(accounts).where(eq(accounts.userId, userId));
}

const waysIn = async (userId: string) => (await accountsOf(userId)).map((a) => a.providerId).sort();

async function latestSubjectTo(address: string): Promise<string> {
  const [latest] = await db()
    .select({ subject: devOutbox.subject })
    .from(devOutbox)
    .where(eq(devOutbox.toAddress, address))
    .orderBy(desc(devOutbox.createdAt), desc(devOutbox.id))
    .limit(1);
  return latest?.subject ?? '';
}

async function eventTypes(userId: string): Promise<string[]> {
  const rows = await withSystem((tx) =>
    tx
      .select({ type: platformEvents.type })
      .from(platformEvents)
      .where(and(eq(platformEvents.subjectType, 'user'), eq(platformEvents.subjectId, userId)))
      .orderBy(platformEvents.id),
  );
  return rows.map((r) => r.type);
}

describe('AU1, AU3: signing in with Google or Apple', () => {
  it('makes a new, confirmed account for a Gmail address, with no code to type', async () => {
    const email = gmail();
    const result = await continueWith('google', { email });
    expect(result.error).toBeNull();
    expect(result.location).toBe('/after');
    expect(result.jar.signedIn).toBe(true);

    const user = await userFor(email);
    expect(user).toMatchObject({ emailVerified: true, name: 'Ann Power' });
    expect(await waysIn(user!.id)).toEqual(['google']);
    const [session] = await db().select().from(sessions).where(eq(sessions.userId, user!.id));
    expect(session).toMatchObject({ signInMethod: 'google' });
    expect(await eventTypes(user!.id)).toEqual(['account.signed_up', 'account.signed_in']);
    // A new account isn't news that Google was connected.
    expect(await latestSubjectTo(email)).toBe('');
  });

  it('AU14: keeps the provider’s ID for the person, and none of its tokens or their photo', async () => {
    const email = gmail();
    await continueWith('google', { email });
    const user = await userFor(email);
    expect(user!.image).toBeNull();
    const [account] = await accountsOf(user!.id);
    expect(account).toMatchObject({
      providerId: 'google',
      accountId: standInIdentity('google', { email, name: '', verified: true }).sub,
      accessToken: null,
      refreshToken: null,
      idToken: null,
      scope: null,
    });
  });

  it('signs the same person in again, by the provider’s ID and not by email', async () => {
    const email = gmail();
    await continueWith('google', { email });
    const user = await userFor(email);

    // Their address at Google has changed since; Google's ID for them hasn't.
    const identity = { ...standInIdentity('google', { email, name: 'Ann Power', verified: true }) };
    identity.email = gmail();
    const again = await continueWith('google', { email }, { identity });
    expect(again.error).toBeNull();
    expect(await accountsOf(user!.id)).toHaveLength(1);
    expect(await userFor(identity.email)).toBeNull();
    const all = await db().select().from(sessions).where(eq(sessions.userId, user!.id));
    expect(all).toHaveLength(2);
  });

  it('makes a new account for a Google Workspace address, which Google hosts', async () => {
    const email = work();
    const result = await continueWith('google', { email, workspace: true });
    expect(result.error).toBeNull();
    expect(await userFor(email)).toMatchObject({ emailVerified: true });
  });

  it('comes back through Apple’s form post, with Hide My Email as the account’s address', async () => {
    const email = `ann.${tag()}@icloud.com`;
    const hidden = standInIdentity('apple', {
      email,
      name: 'Ann Power',
      verified: true,
      hidden: true,
    });
    expect(hidden.email).toMatch(/@privaterelay\.appleid\.com$/);
    const result = await continueWith('apple', { email, hidden: true }, { how: 'form_post' });
    expect(result.error).toBeNull();
    expect(result.jar.signedIn).toBe(true);
    const user = await userFor(hidden.email);
    expect(user).toMatchObject({ emailVerified: true });
    expect(await waysIn(user!.id)).toEqual(['apple']);
    expect(await userFor(email)).toBeNull();
  });

  it('says so when the person cancels at the provider, and signs nobody in', async () => {
    const email = gmail();
    const result = await continueWith('google', { email }, { cancelled: true });
    expect(result.error).toBe('access_denied');
    expect(result.location).toContain('/sign-in?provider=google');
    expect(result.jar.signedIn).toBe(false);
    expect(await userFor(email)).toBeNull();
  });

  it('refuses a code the provider issued to a different sign-in', async () => {
    const email = gmail();
    const result = await continueWith('google', { email }, { codeFor: 'another' });
    expect(result.error).not.toBeNull();
    expect(result.jar.signedIn).toBe(false);
    expect(await userFor(email)).toBeNull();
  });
});

describe('AU4: one person, one account, and never joined on a guess', () => {
  it('asks for a code first when the provider doesn’t host a new address', async () => {
    // A Google account made with a work address that Google doesn't run, and an Apple ID that's
    // a Gmail address: each provider checked the address once, and can't say whose it is now.
    for (const [provider, email] of [
      ['google', work()],
      ['apple', gmail()],
    ] as const) {
      const result = await continueWith(provider, { email });
      expect(result.error).toBe('confirm_email_first');
      expect(result.location).toContain(`/sign-in?provider=${provider}`);
      expect(result.jar.signedIn).toBe(false);
      expect(await userFor(email)).toBeNull();
    }
  });

  it('refuses an address the provider says it never checked', async () => {
    const email = gmail();
    const result = await continueWith('google', { email, verified: false });
    expect(result.error).toBe('email_not_verified');
    expect(await userFor(email)).toBeNull();
  });

  it('joins Google to a confirmed account for a Gmail address, signs in, and emails the owner', async () => {
    const email = gmail();
    await signInByCode(email);
    const user = await userFor(email);

    const result = await continueWith('google', { email });
    expect(result.error).toBeNull();
    expect(result.jar.signedIn).toBe(true);
    expect((await userFor(email))!.id).toBe(user!.id);
    expect(await waysIn(user!.id)).toEqual(['google']);
    expect(await latestSubjectTo(email)).toBe('Google was connected to your Gaff account');
    expect(await eventTypes(user!.id)).toContain('account.method_added');
  });

  it('keeps the password when Google is joined to an account that has one', async () => {
    const email = gmail();
    const created = await createAccount({ email, password: GOOD }, from());
    if (!created.ok) throw new Error('sign-up refused');
    const { confirmEmail } = await import('@/server/auth/flows');
    const { latestCodeTo } = await import('./provider-helpers');
    await confirmEmail({ email, userId: created.userId, code: await latestCodeTo(email) }, from());

    expect((await continueWith('google', { email })).error).toBeNull();
    expect(await waysIn(created.userId)).toEqual(['credential', 'google']);
    expect(await signInWithPassword({ email, password: GOOD }, from())).toEqual({
      outcome: 'signed_in',
    });
  });

  it('doesn’t join a provider that can’t vouch for the address to someone’s account', async () => {
    const email = work();
    await signInByCode(email);
    const user = await userFor(email);

    // Whoever holds a Google account with this address isn't signed in to the Gaff account.
    const result = await continueWith('google', { email });
    expect(result.error).toBe('account_not_linked');
    expect(result.jar.signedIn).toBe(false);
    expect(await waysIn(user!.id)).toEqual([]);
    expect(await latestSubjectTo(email)).not.toBe('Google was connected to your Gaff account');
  });

  it('lets the person who’s signed in connect it themselves, even under another address', async () => {
    const email = work();
    const jar = await signInByCode(email);
    const user = await userFor(email);

    // The same address, which Google doesn't host: fine, because they're signed in.
    const same = await connect('google', { email }, jar);
    expect(same.error).toBeNull();
    expect(same.location).toBe('/account/security');
    expect(await waysIn(user!.id)).toEqual(['google']);
    expect(await latestSubjectTo(email)).toBe('Google was connected to your Gaff account');

    // And an Apple account that hides its address.
    const apple = await connect('apple', { email: `ann.${tag()}@icloud.com`, hidden: true }, jar);
    expect(apple.error).toBeNull();
    expect(await waysIn(user!.id)).toEqual(['apple', 'google']);
    // The account's own address hasn't changed.
    expect((await userFor(email))!.id).toBe(user!.id);

    // From then on, either signs them in to this account.
    const back = await continueWith('google', { email });
    expect(back.error).toBeNull();
    const [newest] = await db()
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user!.id))
      .orderBy(desc(sessions.createdAt))
      .limit(1);
    expect(newest).toMatchObject({ signInMethod: 'google' });
  });

  it('won’t connect a provider account that’s already someone else’s way in', async () => {
    const first = gmail();
    await continueWith('google', { email: first });
    const other = await signInByCode(work());
    const result = await connect('google', { email: first }, other);
    expect(result.error).toBe('account_already_linked_to_different_user');
    expect(await waysIn((await userFor(first))!.id)).toEqual(['google']);
  });

  it('drops a sign-up nobody confirmed when a provider that hosts the address signs in', async () => {
    const email = gmail();
    // A stranger registers the address with their own password, and can't confirm it.
    const strangers = await createAccount({ email, password: GOOD }, from());
    if (!strangers.ok) throw new Error('sign-up refused');

    const result = await continueWith('google', { email });
    expect(result.error).toBeNull();
    const user = await userFor(email);
    expect(user!.id).not.toBe(strangers.userId);
    expect(user).toMatchObject({ emailVerified: true });
    expect(await waysIn(user!.id)).toEqual(['google']);
    expect(await signInWithPassword({ email, password: GOOD }, from())).toEqual({
      outcome: 'wrong',
    });
  });

  it('leaves a pending sign-up alone when the provider can’t vouch for the address', async () => {
    const email = work();
    const pending = await createAccount({ email, password: GOOD }, from());
    if (!pending.ok) throw new Error('sign-up refused');

    const result = await continueWith('google', { email });
    expect(result.error).toBe('account_not_linked');
    expect((await userFor(email))!.id).toBe(pending.userId);
    expect(await waysIn(pending.userId)).toEqual(['credential']);
  });

  it('keeps two people apart when their addresses differ, as with Hide My Email', async () => {
    const real = `ann.${tag()}@icloud.com`;
    const withApple = await continueWith('apple', { email: real, hidden: true });
    expect(withApple.error).toBeNull();
    const second = await signInByCode(real, new Jar());
    expect(second.signedIn).toBe(true);
    const relay = standInIdentity('apple', { email: real, name: '', verified: true, hidden: true });
    expect((await userFor(real))!.id).not.toBe((await userFor(relay.email))!.id);
  });
});
