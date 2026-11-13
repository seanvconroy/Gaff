import { and, eq, ne } from 'drizzle-orm';
import { db, withRenter } from '@/db/client';
import {
  accounts,
  memberships,
  passkeys,
  renterProfiles,
  sessions,
  staffMembers,
  users,
} from '@/db/schema';

/**
 * AU4 (ADR-0028): a sign-up nobody confirmed is only pending. An account made with a password
 * can't be used until its email is confirmed by code, so an unconfirmed one has never been
 * signed in to and has nothing but its password. Nobody has proved the address is theirs.
 *
 * So the next person to prove it wins: when someone signs up again with that address, or signs
 * in with Google or Apple, the pending sign-up is dropped first. Otherwise a stranger could
 * register someone's address, wait for them to confirm it, and know the password.
 */

/** The unconfirmed account for this address, if it's a pending sign-up and nothing more. */
async function pendingUserId(email: string): Promise<string | null> {
  const [user] = await db()
    .select({ id: users.id, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.email, email));
  if (!user || user.emailVerified) return null;
  // An unconfirmed account can't sign in, so it has none of these. If one somehow does, it's a
  // real account and stays.
  const [session] = await db()
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.userId, user.id))
    .limit(1);
  const [member] = await db()
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.userId, user.id))
    .limit(1);
  const [staff] = await db()
    .select({ userId: staffMembers.userId })
    .from(staffMembers)
    .where(eq(staffMembers.userId, user.id));
  const [otherWayIn] = await db()
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, user.id), ne(accounts.providerId, 'credential')))
    .limit(1);
  const [passkey] = await db()
    .select({ id: passkeys.id })
    .from(passkeys)
    .where(eq(passkeys.userId, user.id))
    .limit(1);
  const [renting] = await withRenter(user.id, (tx) =>
    tx.select({ userId: renterProfiles.userId }).from(renterProfiles).limit(1),
  );
  return session || member || staff || otherWayIn || passkey || renting ? null : user.id;
}

/** Drops a pending sign-up for this address, so a new one can take its place. */
export async function dropPendingSignUp(email: string): Promise<boolean> {
  const userId = await pendingUserId(email.trim().toLowerCase());
  if (!userId) return false;
  try {
    const dropped = await db()
      .delete(users)
      .where(and(eq(users.id, userId), eq(users.emailVerified, false)))
      .returning({ id: users.id });
    return dropped.length > 0;
  } catch {
    // Something still refers to it, so it isn't only a pending sign-up after all.
    return false;
  }
}

/**
 * Whether this sign-up is still the one waiting to be confirmed: the same account, still
 * unconfirmed. A code is only good in the browser that made the sign-up it belongs to.
 */
export async function isPendingSignUp(email: string, userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  const [user] = await db()
    .select({ id: users.id, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()));
  return Boolean(user && user.id === userId && !user.emailVerified);
}
