import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { standInPerson } from '@/adapters/sign-in/stand-in';
import { db, withOrg, withPerson, withSystem } from '@/db/client';
import {
  accounts,
  funnelEvents,
  organisationInvites,
  passkeys,
  profileEvents,
  sessions,
  users,
  verifications,
} from '@/db/schema';
import { INVITES_PER_ORGANISATION, perAddress } from '@/domain/auth/limits';
import { auth } from '@/server/auth/auth';
import { ConfirmationNeeded, findConfirmation, grantConfirmation } from '@/server/auth/confirm';
import { cookieNames } from '@/server/auth/cookies';
import { purgeEndedSignIns } from '@/server/auth/housekeeping';
import {
  clientAddress,
  countTry,
  limitFromAddress,
  purgeOldLimits,
  refusal,
  triesSoFar,
} from '@/server/auth/limits';
import {
  disconnectProvider,
  removePasskey,
  renamePasskey,
  signInOverview,
  signOutDevice,
  signOutOtherDevices,
} from '@/server/auth/security';
import { staffAccessOf } from '@/server/auth/staff';
import { resendInvite, inviteColleagues } from '@/server/team/team';
import { createTestMember, queuedJobs } from './helpers';
import {
  anAddress,
  APP,
  askForCode,
  continueWith,
  cookiesFrom,
  signInByCode,
  whoIs,
} from './sign-in-helpers';

// The stand-ins for Google and Apple are registered only with the development tools on. These
// tests run in development, with the real limits (end-to-end runs get a hundred times more).
vi.hoisted(() => {
  process.env.DEV_TOOLS = '1';
});

/**
 * BA-8: sign-in, hardened. The live line's AU tests for limits, closed routes, joining a
 * provider, "How you sign in", devices and clean-up, fitted to the redesign's sign-in
 * (ADR-0015, ADR-0017). The real Better Auth runs against the test database.
 */
const anEmail = () => `${randomUUID()}@ba8.test.gaff.ie`;
const sessionOf = async (cookie: string) =>
  (await auth().api.getSession({ headers: new Headers({ cookie }) }))?.session ?? null;

async function confirmation(userId: string) {
  const grant = await grantConfirmation(userId, 'change_sign_in', 'email_code');
  return { grant, confirmation: await findConfirmation(userId, 'change_sign_in', grant) };
}

async function aPasskeyFor(userId: string, name = 'iCloud Keychain'): Promise<string> {
  const id = randomUUID();
  await db().insert(passkeys).values({
    id,
    name,
    userId,
    publicKey: 'made-up-public-key',
    credentialID: randomUUID(),
    counter: 0,
    deviceType: 'multiDevice',
    backedUp: true,
    createdAt: new Date(),
  });
  return id;
}

/** The person's own record (rule 8), read as only they and the system can. */
const stepsOf = (userId: string) =>
  withPerson(userId, (tx) =>
    tx
      .select({ type: profileEvents.type, data: profileEvents.data })
      .from(profileEvents)
      .where(eq(profileEvents.userId, userId))
      .orderBy(profileEvents.id),
  );

describe('AU12: limits on every sign-in call, counted in Postgres', () => {
  it('counts tries in a window, and starts again when the window ends', async () => {
    const who = randomUUID();
    const start = new Date('2026-11-19T10:00:00Z');
    expect((await countTry('test', who, 60, start)).hits).toBe(1);
    expect((await countTry('test', who, 60, new Date(start.getTime() + 30_000))).hits).toBe(2);
    expect(await triesSoFar('test', who, 60, new Date(start.getTime() + 59_000))).toBe(2);
    expect(await triesSoFar('test', who, 60, new Date(start.getTime() + 60_000))).toBe(0);
    expect((await countTry('test', who, 60, new Date(start.getTime() + 60_000))).hits).toBe(1);
  });

  it('counts at once from many requests without losing any, as serverless instances would', async () => {
    const who = randomUUID();
    const counts = await Promise.all(Array.from({ length: 12 }, () => countTry('test', who, 60)));
    expect(counts.map((c) => c.hits).sort((x, y) => x - y)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
  });

  it('stores no address or email: only a hash, a count and when the window began', async () => {
    const address = anAddress();
    const email = anEmail();
    const { code, cookie } = await askForCode(email);
    await auth().api.signInWithCode({
      body: { code },
      headers: new Headers({ cookie, 'x-forwarded-for': address }),
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

  it('limits tries at a code made in-process, the way Gaff’s screens make them', async () => {
    const address = anAddress();
    const tryOnce = async () => {
      try {
        await auth().api.signInWithCode({
          body: { code: '000000' },
          headers: new Headers({ 'x-forwarded-for': address }),
        });
        return null;
      } catch (error) {
        return refusal(error);
      }
    };
    for (let i = 0; i < perAddress.check_code.max; i++) expect(await tryOnce()).toBeNull();
    const refused = await tryOnce();
    expect(refused).toMatchObject({ limited: true });
    expect(refused!.retryAfterSeconds).toBeGreaterThan(0);
    expect(refused!.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('limits asking for codes and “Confirm it’s you”, each on its own, and says when to try again', async () => {
    const headers = new Headers({ 'x-forwarded-for': anAddress() });
    for (let i = 0; i < perAddress.send_code.max; i++) {
      expect(await limitFromAddress('send_code', headers)).toBeNull();
    }
    const limited = await limitFromAddress('send_code', headers);
    expect(limited?.retryAfterSeconds).toBeGreaterThan(0);
    // Another step from the same address has its own count.
    expect(await limitFromAddress('confirm_send', headers)).toBeNull();
    expect(await limitFromAddress('confirm_check', headers)).toBeNull();
  });

  it('limits requests that arrive over HTTP too: the challenge for a passkey', async () => {
    const address = anAddress();
    const ask = async () =>
      (
        await auth().handler(
          new Request(`${APP}/api/auth/passkey/generate-authenticate-options`, {
            headers: { 'x-forwarded-for': address },
          }),
        )
      ).status;
    for (let i = 0; i < perAddress.passkey_options.max; i++) expect(await ask()).toBe(200);
    expect(await ask()).toBe(429);
  });

  it('sends someone coming back from Google too often to the sign-in screen, with when to try again', async () => {
    const address = anAddress();
    const back = async () =>
      auth().handler(
        new Request(`${APP}/api/auth/callback/google?error=access_denied&state=none`, {
          headers: { 'x-forwarded-for': address },
        }),
      );
    for (let i = 0; i < perAddress.provider.max; i++) await back();
    const limited = await back();
    expect(limited.status).toBe(302);
    const location = new URL(limited.headers.get('location')!, APP);
    expect(location.pathname).toBe('/sign-in');
    expect(location.searchParams.get('error')).toBe('slow_down');
    expect(location.searchParams.get('from')).toBe('google');
    expect(Number(location.searchParams.get('wait'))).toBeGreaterThan(0);
  });

  it('never limits reading the session, which every page does', async () => {
    const headers = new Headers({ 'x-forwarded-for': anAddress() });
    for (let i = 0; i < 40; i++) expect(await auth().api.getSession({ headers })).toBeNull();
  });

  it('reads the address a request came from, which the host sets', () => {
    expect(clientAddress(new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe(
      '203.0.113.9',
    );
    expect(clientAddress(new Headers())).toBe('local');
    expect(clientAddress(undefined)).toBe('local');
  });

  it('AU12, UX-AG-11: limits an organisation to 30 invites an hour, new or sent again', async () => {
    const admin = await createTestMember();
    const some = (n: number) => Array.from({ length: n }, () => anEmail()).join(', ');
    expect(await inviteColleagues(admin, { emails: some(20), role: 'negotiator' })).toMatchObject({
      ok: true,
      invited: 20,
    });
    expect(await inviteColleagues(admin, { emails: some(9), role: 'negotiator' })).toMatchObject({
      ok: true,
      invited: 9,
    });
    // Two more would make 31: neither goes, and the screen says how many still can.
    const over = await inviteColleagues(admin, {
      emails: `${anEmail()}, ${anEmail()}`,
      role: 'negotiator',
    });
    expect(over).toEqual({
      ok: false,
      errors: {
        emails: 'You can send 1 more invite this hour. Send fewer now, or the rest in 60 minutes.',
      },
    });
    const one = await inviteColleagues(admin, { emails: anEmail(), role: 'negotiator' });
    expect(one).toMatchObject({ ok: true, invited: 1 });
    // The thirty-first, even sent again, waits for the hour.
    const [invite] = await withOrg(admin.organisationId, (tx) =>
      tx.select({ id: organisationInvites.id }).from(organisationInvites).limit(1),
    );
    await expect(resendInvite(admin, invite!.id)).rejects.toThrow(/You’ve sent 30 invites/);
    expect(INVITES_PER_ORGANISATION.max).toBe(30);
  });
});

describe('AU12: only the routes a browser needs answer over HTTP', () => {
  function post(path: string, body: unknown, cookie = ''): Promise<Response> {
    return auth().handler(
      new Request(`${APP}/api/auth${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: APP,
          cookie,
          'x-forwarded-for': anAddress(),
        },
        body: JSON.stringify(body),
      }),
    );
  }

  it('answers “not found” for the routes Gaff’s own screens call from the server', async () => {
    const email = anEmail();
    const { cookie, userId } = await signInByCode(email);
    const { code, cookie: codeCookie } = await askForCode(anEmail());
    const calls: [string, unknown, string][] = [
      ['/gaff/sign-in/code', { code }, codeCookie],
      ['/gaff/sign-in/link', { token: 'a'.repeat(43) }, ''],
      ['/sign-in/social', { provider: 'google', callbackURL: '/' }, ''],
      ['/link-social', { provider: 'google' }, cookie],
      ['/unlink-account', { providerId: 'google' }, cookie],
      ['/passkey/delete-passkey', { id: 'anything' }, cookie],
      ['/passkey/update-passkey', { id: 'anything', name: 'x' }, cookie],
      ['/revoke-other-sessions', {}, cookie],
      ['/revoke-sessions', {}, cookie],
      ['/update-user', { name: 'Someone Else' }, cookie],
      ['/update-session', { signInMethod: 'passkey' }, cookie],
      ['/delete-user', {}, cookie],
      ['/sign-out', {}, cookie],
    ];
    for (const [path, body, withCookie] of calls) {
      expect([path, (await post(path, body, withCookie)).status]).toEqual([path, 404]);
    }
    // Nothing happened: still signed in, as themselves, and the session says how it began.
    const session = await auth().api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user).toMatchObject({ id: userId, email });
    expect(session?.session).toMatchObject({ signInMethod: 'email_code' });
  });

  it('BA-8: has no password route or setting at all (Q30: there are no passwords)', async () => {
    const email = anEmail();
    for (const [path, body] of [
      ['/sign-up/email', { email, password: 'the bins go out on tuesday', name: 'Someone' }],
      ['/sign-in/email', { email, password: 'the bins go out on tuesday' }],
      ['/change-password', { currentPassword: 'a', newPassword: 'b' }],
      ['/set-password', { newPassword: 'the bins go out on tuesday' }],
      ['/request-password-reset', { email }],
      ['/reset-password', { newPassword: 'the bins go out on tuesday', token: 'x' }],
    ] as const) {
      expect([path, (await post(path, body)).status]).toEqual([path, 404]);
    }
    expect(auth().options.emailAndPassword?.enabled).toBe(false);
    // Not from Gaff's own server either: the library refuses a password sign-up outright.
    await expect(
      auth().api.signUpEmail({
        body: { email, password: 'the bins go out on tuesday', name: 'Someone' },
        headers: new Headers({ 'x-forwarded-for': anAddress() }),
      }),
    ).rejects.toThrow();
    const made = await db().select().from(users).where(eq(users.email, email));
    expect(made).toEqual([]);
    const { rows } = await db().execute(
      sql`select 1 from accounts where provider_id = 'credential' or password is not null`,
    );
    expect(rows).toEqual([]);
  });

  it('still answers what only a browser can do: passkeys, and coming back from a provider', async () => {
    const get = (path: string, cookie = '') =>
      auth().handler(
        new Request(`${APP}/api/auth${path}`, {
          headers: { cookie, 'x-forwarded-for': anAddress() },
        }),
      );
    const { cookie } = await signInByCode(anEmail());
    expect((await get('/get-session', cookie)).status).toBe(200);
    expect((await get('/passkey/generate-authenticate-options')).status).toBe(200);
    // Signed in just now: the passkey offer may add one with nothing more (UX-SI-4).
    expect((await get('/passkey/generate-register-options', cookie)).status).toBe(200);
    const back = await get('/callback/google?error=access_denied&state=none');
    expect(back.status).not.toBe(404);
  });
});

describe('AU4: Google or Apple joins someone only for an address it looks after', () => {
  const notJoinedCount = async () => {
    const rows = await withSystem((tx) =>
      tx
        .select({ variant: funnelEvents.variant, data: funnelEvents.data })
        .from(funnelEvents)
        .where(eq(funnelEvents.step, 'account.sign_in_failed')),
    );
    return rows;
  };

  it('asks a new person for a code first when the provider doesn’t look after the address', async () => {
    const email = anEmail();
    const before = (await notJoinedCount()).length;
    const back = await continueWith(
      standInPerson('google', { name: 'Orla Kelly', email, notHosted: true }),
    );
    expect(back.signedIn).toBe(false);
    expect(back.location.pathname).toBe('/sign-in');
    expect(back.location.searchParams.get('error')).toBe('confirm_email_first');
    expect(await db().select().from(users).where(eq(users.email, email))).toEqual([]);
    // Counted, with the provider and the reason, and nothing about the person.
    const counted = await notJoinedCount();
    expect(counted.length).toBe(before + 1);
    expect(counted.at(-1)).toEqual({ variant: 'google', data: { notJoined: true } });
  });

  it('never joins it to someone who has the address, and tells them by email', async () => {
    const email = anEmail();
    const owner = await signInByCode(email);
    const back = await continueWith(
      standInPerson('google', { name: 'Not Orla', email, notHosted: true }),
    );
    expect(back.signedIn).toBe(false);
    expect(back.location.searchParams.get('error')).toBe('account_not_linked');
    expect(await db().select().from(accounts).where(eq(accounts.userId, owner.userId))).toEqual([]);
    const told = (await queuedJobs('send_account_email')).filter(
      (job) => job.kind === 'sign_in_refused' && job.userId === owner.userId,
    );
    expect(told).toEqual([
      { kind: 'sign_in_refused', userId: owner.userId, provider: 'google', at: expect.any(String) },
    ]);
  });

  it('joins and signs in where it looks after the address, and tells the owner it was added', async () => {
    const email = `${randomUUID()}@icloud.com`;
    const owner = await signInByCode(email);
    const back = await continueWith(standInPerson('apple', { name: 'Orla Kelly', email }));
    expect(back.signedIn).toBe(true);
    expect((await whoIs(back.cookie))?.id).toBe(owner.userId);
    const told = (await queuedJobs('send_account_email')).filter(
      (job) => job.kind === 'sign_in_changed' && job.userId === owner.userId,
    );
    expect(told).toMatchObject([{ change: 'added', method: 'apple' }]);
    expect(await stepsOf(owner.userId)).toEqual([
      { type: 'profile.sign_in_added', data: { method: 'apple' } },
    ]);
    // Its session says how it began (M5).
    expect(await sessionOf(back.cookie)).toMatchObject({ signInMethod: 'apple' });
  });

  it('a new person by a provider is news to nobody: no “was connected” email', async () => {
    const email = `${randomUUID()}@gmail.com`;
    const back = await continueWith(standInPerson('google', { name: 'Orla Kelly', email }));
    expect(back.signedIn).toBe(true);
    const person = await whoIs(back.cookie);
    const told = (await queuedJobs('send_account_email')).filter(
      (job) => job.userId === person!.id,
    );
    expect(told).toEqual([]);
  });

  it('connects any verified address from “How you sign in”, for the person signed in', async () => {
    const owner = await signInByCode(anEmail());
    const other = `${randomUUID()}@elsewhere.test`;
    const back = await continueWith(
      standInPerson('google', { name: 'Orla Kelly', email: other, notHosted: true }),
      { cookie: owner.cookie, link: true },
    );
    expect(back.location.pathname).toBe('/profile');
    expect(back.location.searchParams.get('error')).toBeNull();
    const ways = await db().select().from(accounts).where(eq(accounts.userId, owner.userId));
    expect(ways.map((way) => way.providerId)).toEqual(['google']);
    // From then on, Google signs them in by its own ID for them.
    const again = await continueWith(
      standInPerson('google', { name: 'Orla Kelly', email: other, notHosted: true }),
    );
    expect((await whoIs(again.cookie))?.id).toBe(owner.userId);
  });
});

describe('AU6, AU7: “How you sign in” changes only with “Confirm it’s you”', () => {
  it('disconnects Google once they’ve confirmed, records it and tells them', async () => {
    const email = `${randomUUID()}@gmail.com`;
    const owner = await signInByCode(email);
    await continueWith(standInPerson('google', { name: 'Orla Kelly', email }));
    await expect(disconnectProvider(owner.userId, null, 'google')).rejects.toBeInstanceOf(
      ConfirmationNeeded,
    );
    const { confirmation: confirmed } = await confirmation(owner.userId);
    expect(await disconnectProvider(owner.userId, confirmed, 'google')).toBe('done');
    expect(await db().select().from(accounts).where(eq(accounts.userId, owner.userId))).toEqual([]);
    // A confirmation works once.
    expect(await disconnectProvider(owner.userId, confirmed, 'google')).toBe('not_found');
    expect((await stepsOf(owner.userId)).map((step) => step.type)).toEqual([
      'profile.sign_in_added',
      'profile.sign_in_removed',
    ]);
    const told = (await queuedJobs('send_account_email')).filter(
      (job) => job.kind === 'sign_in_changed' && job.userId === owner.userId,
    );
    expect(told).toMatchObject([
      { change: 'added', method: 'google' },
      { change: 'removed', method: 'google' },
    ]);
    // A code still gets them in.
    expect((await signInByCode(email)).userId).toBe(owner.userId);
  });

  it('keeps Apple on a Hide My Email account, and never leaves anyone with no way in', async () => {
    const person = standInPerson('apple', {
      name: 'Cian Byrne',
      email: anEmail(),
      hideEmail: true,
    });
    const back = await continueWith(person);
    const user = (await whoIs(back.cookie))!;
    const { confirmation: confirmed } = await confirmation(user.id);
    expect(await disconnectProvider(user.id, confirmed, 'apple')).toBe('hide_my_email');
    expect(await db().select().from(accounts).where(eq(accounts.userId, user.id))).toHaveLength(1);
    // The confirmation wasn't spent on a change that didn't happen.
    expect(await findConfirmation(user.id, 'change_sign_in', null)).toBeNull();
  });

  it('renames and removes their own passkeys, and nobody else’s', async () => {
    const owner = await signInByCode(anEmail());
    const stranger = await signInByCode(anEmail());
    const key = await aPasskeyFor(owner.userId);

    await expect(renamePasskey(owner.userId, null, key, 'Work laptop')).rejects.toBeInstanceOf(
      ConfirmationNeeded,
    );
    expect(
      await renamePasskey(owner.userId, (await confirmation(owner.userId)).confirmation, key, '  '),
    ).toBe('no_name');
    expect(
      await renamePasskey(
        stranger.userId,
        (await confirmation(stranger.userId)).confirmation,
        key,
        'Mine now',
      ),
    ).toBe('not_found');
    expect(
      await renamePasskey(
        owner.userId,
        (await confirmation(owner.userId)).confirmation,
        key,
        ' Work   laptop ',
      ),
    ).toBe('done');
    const overview = await signInOverview(owner.userId, null);
    expect(overview.passkeys).toMatchObject([{ id: key, name: 'Work laptop' }]);

    expect(
      await removePasskey(stranger.userId, (await confirmation(stranger.userId)).confirmation, key),
    ).toBe('not_found');
    expect(
      await removePasskey(owner.userId, (await confirmation(owner.userId)).confirmation, key),
    ).toBe('done');
    expect((await signInOverview(owner.userId, null)).passkeys).toEqual([]);
    expect((await stepsOf(owner.userId)).map((step) => step.type)).toEqual([
      'profile.passkey_renamed',
      'profile.sign_in_removed',
    ]);
  });

  it('adds a passkey later only once they’ve confirmed it’s them (UX-SI-10)', async () => {
    const { cookie, userId } = await signInByCode(anEmail());
    // A day on, the passkey offer's moment has passed.
    await db()
      .update(sessions)
      .set({ createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000) })
      .where(eq(sessions.userId, userId));
    const ask = (withCookie: string) =>
      auth().handler(
        new Request(`${APP}/api/auth/passkey/generate-register-options`, {
          headers: { cookie: withCookie, 'x-forwarded-for': anAddress() },
        }),
      );
    const refused = await ask(cookie);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: 'CONFIRM_FIRST' });
    const { grant } = await confirmation(userId);
    expect((await ask(`${cookie}; ${cookieNames.confirmed}=${grant}`)).status).toBe(200);
  });
});

describe('AU8: signed-in devices', () => {
  const iphone =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 19_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Mobile/15E148 Safari/604.1';

  it('names each device in plain words, this one first, and signs out one or all the others', async () => {
    const email = anEmail();
    const laptop = await signInByCode(email);
    const phone = await signInByCode(email);
    const tablet = await signInByCode(email);
    await db()
      .update(sessions)
      .set({ userAgent: iphone })
      .where(eq(sessions.id, (await sessionOf(phone.cookie))!.id));
    const here = (await sessionOf(laptop.cookie))!;

    const overview = await signInOverview(laptop.userId, here.id);
    expect(overview.devices).toHaveLength(3);
    expect(overview.devices[0]).toMatchObject({ id: here.id, current: true });
    expect(overview.devices.map((device) => device.words)).toContain('Safari on an iPhone');
    expect(JSON.stringify(overview.devices)).not.toContain('Mozilla');

    const phoneId = (await sessionOf(phone.cookie))!.id;
    expect(await signOutDevice(laptop.userId, phoneId, here.id)).toBe('done');
    expect(await whoIs(phone.cookie)).toBeNull();
    // This device signs out from the account menu, not from here; and nobody else's.
    expect(await signOutDevice(laptop.userId, here.id, here.id)).toBe('not_found');
    const stranger = await signInByCode(anEmail());
    expect(await signOutDevice(stranger.userId, (await sessionOf(tablet.cookie))!.id, null)).toBe(
      'not_found',
    );

    expect(await signOutOtherDevices(laptop.userId, here.id)).toBe(1);
    expect(await whoIs(tablet.cookie)).toBeNull();
    expect(await whoIs(laptop.cookie)).toMatchObject({ id: laptop.userId });
    expect(await stepsOf(laptop.userId)).toEqual([
      { type: 'profile.signed_out_elsewhere', data: { sessions: 1 } },
      { type: 'profile.signed_out_elsewhere', data: { sessions: 1 } },
    ]);
  });

  it('keeps one session to a browser: signing in again there ends the one it had', async () => {
    const first = await signInByCode(anEmail());
    const second = await signInByCode(anEmail(), first.cookie);
    expect(await whoIs(first.cookie)).toBeNull();
    expect(await whoIs(second.cookie)).toMatchObject({ id: second.userId });
    const left = await db().select().from(sessions).where(eq(sessions.userId, first.userId));
    expect(left).toEqual([]);
  });
});

describe('BA-8, M5: Gaff’s team need a passkey sign-in in production', () => {
  it('lets staff in on a recent passkey sign-in, and sends them to add or use one otherwise', async () => {
    const { userId, cookie } = await signInByCode(anEmail());
    const session = (await auth().api.getSession({ headers: new Headers({ cookie }) }))!;
    expect(await staffAccessOf(session, false)).toBe('allowed');
    expect(await staffAccessOf(session, true)).toBe('needs_a_passkey');
    await aPasskeyFor(userId);
    expect(await staffAccessOf(session, true)).toBe('needs_passkey_sign_in');
    const byPasskey = {
      ...session,
      session: { ...session.session, signInMethod: 'passkey', createdAt: new Date() },
    };
    expect(await staffAccessOf(byPasskey, true)).toBe('allowed');
  });
});

describe('AU14: the nightly clean-up clears what sign-in leaves behind', () => {
  it('deletes ended sessions, run-out verifications and old limiter counters', async () => {
    const { userId, cookie } = await signInByCode(anEmail());
    const live = await signInByCode(anEmail());
    await db()
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.userId, userId));
    const ranOut = randomUUID();
    const standing = randomUUID();
    await db()
      .insert(verifications)
      .values([
        {
          id: ranOut,
          identifier: `state-${ranOut}`,
          value: '{}',
          expiresAt: new Date(Date.now() - 1000),
        },
        {
          id: standing,
          identifier: `state-${standing}`,
          value: '{}',
          expiresAt: new Date(Date.now() + 600_000),
        },
      ]);
    const who = randomUUID();
    await countTry('old', who, 60, new Date(Date.now() - 25 * 60 * 60 * 1000));
    await countTry('new', who, 60);

    const purged = await withSystem(async (tx) => ({
      ...(await purgeEndedSignIns(tx, new Date())),
      limits: await purgeOldLimits(tx, new Date()),
    }));
    expect(purged.sessions).toBeGreaterThanOrEqual(1);
    expect(purged.verifications).toBeGreaterThanOrEqual(1);
    expect(purged.limits).toBeGreaterThanOrEqual(1);
    expect(await db().select().from(sessions).where(eq(sessions.userId, userId))).toEqual([]);
    expect(await whoIs(cookie)).toBeNull();
    expect(await whoIs(live.cookie)).toMatchObject({ id: live.userId });
    const left = await db()
      .select({ id: verifications.id })
      .from(verifications)
      .where(and(eq(verifications.id, standing)));
    expect(left).toEqual([{ id: standing }]);
    expect(await db().select().from(verifications).where(eq(verifications.id, ranOut))).toEqual([]);
    expect(await triesSoFar('old', who, 10 * 24 * 60 * 60)).toBe(0);
    expect(await triesSoFar('new', who, 60)).toBe(1);
  });

  it('runs as part of the retention job', async () => {
    const { sweepPersonalData } = await import('@/server/retention/sweep');
    const { userId } = await signInByCode(anEmail());
    await db()
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.userId, userId));
    await sweepPersonalData(new Date());
    expect(await db().select().from(sessions).where(eq(sessions.userId, userId))).toEqual([]);
    expect(cookiesFrom(new Headers())).toBe('');
  });
});
