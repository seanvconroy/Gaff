import { and, asc, eq, gte, ne } from 'drizzle-orm';
import { withSystem } from '@/db/client';
import { identityChecks, users } from '@/db/schema';
import { MAX_ATTEMPTS, isChecked } from '@/domain/identity/access';
import type { IdentityReason } from '@/ports/identity';
import type { Staff } from '@/server/auth/staff';
import { UserFacingError } from '@/server/errors';
import { recordPlatformEvent } from '@/server/record/platform-events';

export interface OutOfTries {
  userId: string;
  name: string;
  email: string;
  reason: IdentityReason | null;
  since: Date;
}

/**
 * P25 (Q60): people, renters or letters, whose ID Stripe couldn't verify in three tries. There's
 * no other way through, so a person at Gaff can give them more tries. Only someone with a
 * `Staff` record can ask: it reads across people, so it runs as the system.
 */
export async function outOfTries(staff: Staff): Promise<OutOfTries[]> {
  void staff;
  const rows = await withSystem((tx) =>
    tx
      .select({
        userId: identityChecks.userId,
        status: identityChecks.status,
        selfie: identityChecks.selfie,
        attempts: identityChecks.attempts,
        reason: identityChecks.reason,
        since: identityChecks.updatedAt,
        name: users.name,
        email: users.email,
      })
      .from(identityChecks)
      .innerJoin(users, eq(users.id, identityChecks.userId))
      .where(and(gte(identityChecks.attempts, MAX_ATTEMPTS), ne(identityChecks.status, 'pending')))
      .orderBy(asc(identityChecks.updatedAt)),
  );
  return rows
    .filter((row) => !isChecked(row))
    .map(({ userId, name, email, reason, since }) => ({ userId, name, email, reason, since }));
}

/** P25: a person at Gaff gives someone three more tries with Stripe, and it's logged. */
export async function allowMoreTries(staff: Staff, userId: string): Promise<void> {
  const given = await withSystem(async (tx) => {
    const [row] = await tx
      .select()
      .from(identityChecks)
      .where(eq(identityChecks.userId, userId))
      .for('update');
    if (!row || isChecked(row) || row.status === 'pending' || row.attempts < MAX_ATTEMPTS) {
      return null;
    }
    await tx
      .update(identityChecks)
      .set({ status: 'not_verified', attempts: 0 })
      .where(eq(identityChecks.id, row.id));
    await recordPlatformEvent(tx, {
      type: 'identity.more_tries',
      actor: { type: 'staff', userId: staff.userId },
      subject: { type: 'identity_check', id: row.id },
      data: { checkId: row.id },
    });
    return row.id;
  });
  if (!given) throw new UserFacingError('They still have tries left, or they’re already checked.');
}
