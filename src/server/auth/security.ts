import { and, asc, eq, gt, ne } from 'drizzle-orm';
import { withPerson, type Tx } from '@/db/client';
import { accounts, passkeys, sessions, users } from '@/db/schema';
import { describeDevice, inListOrder } from '@/domain/auth/devices';
import { removalRefusal, type RemovalRefusal } from '@/domain/auth/email-authority';
import { signInProviders, type SignInProvider } from '@/domain/auth/methods';
import { readPasskeyName } from '@/domain/auth/passkeys';
import { recordProfileEvent } from '@/server/accounts/profile-events';
import { enqueue } from '@/server/jobs/enqueue';
import { spendConfirmation, type Confirmation } from './confirm';

/**
 * BA-8 (AU6, AU7, AU8): "How you sign in" and "Signed-in devices" on Profile. Every change here
 * is made by the signed-in person, about their own account, through `withPerson()`.
 *
 * Each change to how they sign in (disconnecting Google or Apple, renaming or removing a
 * passkey; connecting and adding go through ./security-connect and the passkey plugin) spends a
 * "Confirm it's you" for `change_sign_in` in the transaction that makes it (UX-SI-10), writes
 * its step to the person's record, and queues the email that tells them (AU11). Signing devices
 * out only takes access away, so it asks for nothing more.
 */

export interface SignInOverview {
  email: string;
  /** When Google and Apple were connected, if they are. */
  providers: Record<SignInProvider, Date | null>;
  passkeys: { id: string; name: string | null; addedOn: Date | null }[];
  devices: {
    id: string;
    words: string;
    signedInAt: Date;
    lastActive: Date;
    current: boolean;
  }[];
}

export async function signInOverview(
  userId: string,
  currentSessionId: string | null,
  now = new Date(),
): Promise<SignInOverview> {
  return withPerson(userId, async (tx) => {
    const [person] = await tx
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId));
    const ways = await tx
      .select({ providerId: accounts.providerId, createdAt: accounts.createdAt })
      .from(accounts)
      .where(eq(accounts.userId, userId));
    const connected = (provider: SignInProvider) =>
      ways.find((way) => way.providerId === provider)?.createdAt ?? null;
    const keys = await tx
      .select({ id: passkeys.id, name: passkeys.name, createdAt: passkeys.createdAt })
      .from(passkeys)
      .where(eq(passkeys.userId, userId))
      .orderBy(asc(passkeys.createdAt));
    const live = await tx
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, now)));
    return {
      email: person?.email ?? '',
      providers: { google: connected('google'), apple: connected('apple') },
      passkeys: keys.map((key) => ({ id: key.id, name: key.name, addedOn: key.createdAt })),
      devices: inListOrder(
        live.map((session) => ({
          id: session.id,
          words: describeDevice(session.userAgent),
          signedInAt: session.createdAt,
          lastActive: session.updatedAt,
          current: session.id === currentSessionId,
        })),
      ),
    };
  });
}

/** What a change on "How you sign in" came to. */
export type SignInChange = 'done' | 'not_found' | RemovalRefusal;

type ChangedWayIn = SignInProvider | 'passkey';

/**
 * AU11, rule 8: a way in was added to or taken off someone's account. Its step goes in their
 * record and the email that tells them is queued, in the caller's transaction.
 */
export async function noteSignInChange(
  tx: Tx,
  userId: string,
  change: 'added' | 'removed',
  method: ChangedWayIn,
  now = new Date(),
): Promise<void> {
  await recordProfileEvent(
    tx,
    userId,
    change === 'added' ? 'profile.sign_in_added' : 'profile.sign_in_removed',
    { method },
    now,
  );
  await enqueue(tx, 'send_account_email', {
    kind: 'sign_in_changed',
    userId,
    change,
    method,
    at: now.toISOString(),
  });
}

/**
 * For a change Better Auth has just written itself (a provider connected, a passkey added): the
 * step and the email follow in a transaction of their own, straight after. A failure here is
 * logged and never undoes the change.
 */
export async function noteSignInChangeAfter(
  userId: string,
  change: 'added' | 'removed',
  method: ChangedWayIn,
): Promise<void> {
  try {
    await withPerson(userId, (tx) => noteSignInChange(tx, userId, change, method));
  } catch (error) {
    console.error(
      `A sign-in change (${change} ${method}) was not recorded:`,
      error instanceof Error ? error.name : 'unknown error',
    );
  }
}

/** Everything removalRefusal() needs to know about the person's ways in, read in this transaction. */
async function waysIn(tx: Tx, userId: string) {
  const [person] = await tx
    .select({ email: users.email, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, userId));
  const ways = await tx
    .select({ providerId: accounts.providerId })
    .from(accounts)
    .where(eq(accounts.userId, userId));
  const keys = await tx
    .select({ id: passkeys.id })
    .from(passkeys)
    .where(eq(passkeys.userId, userId));
  return {
    email: person?.email ?? '',
    emailVerified: person?.emailVerified ?? false,
    providers: signInProviders.filter((p) => ways.some((way) => way.providerId === p)),
    passkeys: keys.length,
  };
}

/**
 * AU7: disconnects Google or Apple. A code by email still gets them in; Apple stays on a Hide My
 * Email account, and nothing goes that would leave them no way in.
 */
export async function disconnectProvider(
  userId: string,
  confirmation: Confirmation | null,
  provider: SignInProvider,
  now = new Date(),
): Promise<SignInChange> {
  return withPerson(userId, async (tx) => {
    const facts = await waysIn(tx, userId);
    if (!facts.providers.includes(provider)) return 'not_found';
    const refused = removalRefusal({ ...facts, remove: provider });
    if (refused) return refused;
    await spendConfirmation(tx, confirmation, 'change_sign_in', userId, now);
    await tx
      .delete(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, provider)));
    await noteSignInChange(tx, userId, 'removed', provider, now);
    return 'done';
  });
}

/** AU6: removes one of the person's own passkeys. */
export async function removePasskey(
  userId: string,
  confirmation: Confirmation | null,
  passkeyId: string,
  now = new Date(),
): Promise<SignInChange> {
  return withPerson(userId, async (tx) => {
    const [key] = await tx
      .select({ id: passkeys.id })
      .from(passkeys)
      .where(and(eq(passkeys.id, passkeyId), eq(passkeys.userId, userId)));
    if (!key) return 'not_found';
    const refused = removalRefusal({ ...(await waysIn(tx, userId)), remove: 'passkey' });
    if (refused) return refused;
    await spendConfirmation(tx, confirmation, 'change_sign_in', userId, now);
    await tx.delete(passkeys).where(and(eq(passkeys.id, passkeyId), eq(passkeys.userId, userId)));
    await noteSignInChange(tx, userId, 'removed', 'passkey', now);
    return 'done';
  });
}

/** AU6: renames one of the person's own passkeys, so they can tell them apart. */
export async function renamePasskey(
  userId: string,
  confirmation: Confirmation | null,
  passkeyId: string,
  name: unknown,
  now = new Date(),
): Promise<SignInChange | 'no_name'> {
  const tidy = readPasskeyName(name);
  if (!tidy) return 'no_name';
  return withPerson(userId, async (tx) => {
    const [key] = await tx
      .select({ id: passkeys.id })
      .from(passkeys)
      .where(and(eq(passkeys.id, passkeyId), eq(passkeys.userId, userId)));
    if (!key) return 'not_found';
    await spendConfirmation(tx, confirmation, 'change_sign_in', userId, now);
    await tx.update(passkeys).set({ name: tidy }).where(eq(passkeys.id, passkeyId));
    await recordProfileEvent(tx, userId, 'profile.passkey_renamed', {}, now);
    return 'done';
  });
}

/** AU8: signs one other device out. This device signs out from the account menu. */
export async function signOutDevice(
  userId: string,
  sessionId: string,
  currentSessionId: string | null,
): Promise<'done' | 'not_found'> {
  return withPerson(userId, async (tx) => {
    const gone = await tx
      .delete(sessions)
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(sessions.userId, userId),
          currentSessionId ? ne(sessions.id, currentSessionId) : undefined,
        ),
      )
      .returning({ id: sessions.id });
    if (gone.length === 0) return 'not_found';
    await recordProfileEvent(tx, userId, 'profile.signed_out_elsewhere', { sessions: 1 });
    return 'done';
  });
}

/** AU8: signs every other device out, and says how many. */
export async function signOutOtherDevices(
  userId: string,
  currentSessionId: string | null,
): Promise<number> {
  return withPerson(userId, async (tx) => {
    const gone = await tx
      .delete(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          currentSessionId ? ne(sessions.id, currentSessionId) : undefined,
        ),
      )
      .returning({ id: sessions.id });
    if (gone.length > 0) {
      await recordProfileEvent(tx, userId, 'profile.signed_out_elsewhere', {
        sessions: gone.length,
      });
    }
    return gone.length;
  });
}
