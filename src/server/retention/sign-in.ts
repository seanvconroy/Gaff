import { and, eq, isNull, lt } from 'drizzle-orm';
import { db, withSystem } from '@/db/client';
import { invitations, sessions, users, verifications } from '@/db/schema';
import { pendingSignUpCutoff } from '@/domain/auth/housekeeping';
import { sweepLimits } from '@/server/auth/limits';
import { dropPendingSignUp } from '@/server/auth/pending-sign-up';

/** A night's work is bounded: anything past this waits for the next night. */
const PENDING_BATCH = 500;

/**
 * Rule 9, AU14: sign-in's own leftovers, cleared by the nightly job.
 * - Sessions past their end.
 * - Codes, passkey challenges and half-finished Google and Apple sign-ins that have run out.
 * - Sign-ups nobody confirmed within 7 days: the address and password go.
 * - Invitations nobody accepted before they ran out: the address goes.
 * - The limiter's counters over a day old.
 * Accounts themselves stay until their owner deletes them.
 */
export async function sweepSignIn(now = new Date()): Promise<{
  sessions: number;
  codes: number;
  pendingSignUps: number;
  invitations: number;
  limits: number;
}> {
  const expiredSessions = await db()
    .delete(sessions)
    .where(lt(sessions.expiresAt, now))
    .returning({ id: sessions.id });
  const expiredCodes = await db()
    .delete(verifications)
    .where(lt(verifications.expiresAt, now))
    .returning({ id: verifications.id });

  const unconfirmed = await db()
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.emailVerified, false), lt(users.createdAt, pendingSignUpCutoff(now))))
    .limit(PENDING_BATCH);
  let pendingSignUps = 0;
  for (const { email } of unconfirmed) {
    // Only a sign-up and nothing more: an account with a team, a passkey or a renting profile
    // is a real one, and stays.
    if (await dropPendingSignUp(email)) pendingSignUps += 1;
  }

  // Invitations belong to workspaces; this job clears every workspace's.
  const expiredInvitations = await withSystem((tx) =>
    tx
      .delete(invitations)
      .where(and(isNull(invitations.acceptedAt), lt(invitations.expiresAt, now)))
      .returning({ id: invitations.id }),
  );

  return {
    sessions: expiredSessions.length,
    codes: expiredCodes.length,
    pendingSignUps,
    invitations: expiredInvitations.length,
    limits: await sweepLimits(now),
  };
}
