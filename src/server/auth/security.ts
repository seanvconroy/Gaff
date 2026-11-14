import { and, desc, eq, gt, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import { accounts, passkeys, sessions, users } from '@/db/schema';
import { describeDevice } from '@/domain/auth/devices';
import { canDisconnect, type SocialProvider } from '@/domain/auth/email-authority';
import { passkeyKind, passkeyName, readPasskeyName } from '@/domain/auth/passkeys';
import { signInMethods, type SignInMethod } from '@/domain/auth/sign-in-methods';
import { APIError } from 'better-auth/api';
import { recordAccountEvent } from './account-events';
import { auth } from './auth';
import { needsRecentSignIn } from './recent';

/**
 * AU7, AU8: "How you sign in": the ways into one account, and the devices signed in to it. For
 * renters, letters and staff alike. Every change here is made by the person signed in, about
 * their own account, and the ones that change how they sign in need a recent sign-in (./recent).
 */

export interface SignInOverview {
  hasPassword: boolean;
  /** When Google and Apple were connected, if they are. */
  providers: Record<SocialProvider, Date | null>;
  passkeys: { id: string; name: string; addedOn: Date | null; kind: 'synced' | 'this_device' }[];
  devices: {
    id: string;
    words: string;
    method: SignInMethod | null;
    signedInAt: Date;
    lastActive: Date;
    current: boolean;
  }[];
}

const asMethod = (value: string | null): SignInMethod | null =>
  (signInMethods as readonly string[]).includes(value ?? '') ? (value as SignInMethod) : null;

export async function signInOverview(
  userId: string,
  currentSessionId: string,
): Promise<SignInOverview> {
  const ways = await db()
    .select({ providerId: accounts.providerId, createdAt: accounts.createdAt })
    .from(accounts)
    .where(eq(accounts.userId, userId));
  const connected = (provider: SocialProvider) =>
    ways.find((way) => way.providerId === provider)?.createdAt ?? null;
  const keys = await db()
    .select()
    .from(passkeys)
    .where(eq(passkeys.userId, userId))
    .orderBy(passkeys.createdAt);
  const live = await db()
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.updatedAt));
  return {
    hasPassword: ways.some((way) => way.providerId === 'credential'),
    providers: { google: connected('google'), apple: connected('apple') },
    passkeys: keys.map((key) => ({
      id: key.id,
      name: passkeyName(key.name),
      addedOn: key.createdAt,
      kind: passkeyKind(key.backedUp),
    })),
    devices: live
      .map((session) => ({
        id: session.id,
        words: describeDevice(session.userAgent),
        method: asMethod(session.signInMethod),
        signedInAt: session.createdAt,
        lastActive: session.updatedAt,
        current: session.id === currentSessionId,
      }))
      // This device first, then the most recently used.
      .sort((a, b) => Number(b.current) - Number(a.current)),
  };
}

export type Change = 'done' | 'recent_sign_in_needed' | 'not_found' | 'not_allowed';

async function attempt(change: () => Promise<unknown>): Promise<Change> {
  try {
    await change();
    return 'done';
  } catch (error) {
    if (needsRecentSignIn(error)) return 'recent_sign_in_needed';
    if (!(error instanceof APIError)) throw error;
    return 'not_found';
  }
}

/** AU7: disconnects Google or Apple from the account. A code by email still gets them in. */
export async function disconnectProvider(
  userId: string,
  provider: SocialProvider,
  headers: Headers,
): Promise<Change> {
  const [account] = await db()
    .select({ id: accounts.id, email: users.email })
    .from(accounts)
    .innerJoin(users, eq(users.id, accounts.userId))
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, provider)));
  if (!account) return 'not_found';
  // Hide My Email: Apple is the way in to this account, so it stays.
  if (!canDisconnect(provider, account.email)) return 'not_allowed';
  const result = await attempt(() =>
    auth().api.unlinkAccount({ body: { accountId: account.id }, headers }),
  );
  if (result === 'done') {
    await recordAccountEvent('account.method_removed', userId, { method: provider });
  }
  return result;
}

/** AU6: removes one of the person's own passkeys. */
export async function removePasskey(passkeyId: string, headers: Headers): Promise<Change> {
  return attempt(() => auth().api.deletePasskey({ body: { id: passkeyId }, headers }));
}

/** AU6: renames one of the person's own passkeys, so they can tell them apart. */
export async function renamePasskey(
  passkeyId: string,
  name: unknown,
  headers: Headers,
): Promise<Change> {
  const tidy = readPasskeyName(name);
  if (!tidy) return 'not_found';
  return attempt(() => auth().api.updatePasskey({ body: { id: passkeyId, name: tidy }, headers }));
}

/** AU8: signs one other device out. */
export async function signOutDevice(
  userId: string,
  sessionId: string,
  headers: Headers,
): Promise<Change> {
  const [session] = await db()
    .select({ token: sessions.token })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  if (!session) return 'not_found';
  const result = await attempt(() =>
    auth().api.revokeSession({ body: { token: session.token }, headers }),
  );
  if (result === 'done') {
    await recordAccountEvent('account.signed_out_elsewhere', userId, { sessions: 1 });
  }
  return result;
}

/** AU8: signs every other device out, and says how many. */
export async function signOutOtherDevices(
  userId: string,
  currentSessionId: string,
  headers: Headers,
): Promise<number> {
  const others = await db()
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.id, currentSessionId)));
  if (others.length === 0) return 0;
  await auth().api.revokeOtherSessions({ headers });
  await recordAccountEvent('account.signed_out_elsewhere', userId, { sessions: others.length });
  return others.length;
}
