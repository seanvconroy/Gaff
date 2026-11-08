import { and, asc, eq } from 'drizzle-orm';
import { scopeToOrg, withStaff, withSystem } from '@/db/client';
import { identityChecks, letterChecks, memberships, organisations, users } from '@/db/schema';
import { sealJson } from '@/lib/crypto';
import type { Staff } from '@/server/auth/staff';
import { UserFacingError } from '@/server/errors';
import { recordPlatformEvent } from '@/server/record/platform-events';
import { refreshCopies } from './identity';

export interface OfflineIdentity {
  userId: string;
  name: string;
  email: string;
  organisationName: string;
  waitingSince: Date;
}

/**
 * P20, Q55: letters whose ID can't be checked online, waiting for a person at Gaff to see the
 * original another way (a short video call, once the founders choose the tool). Renters never
 * wait here: the letter who chooses them sees their ID in person (P27).
 */
export async function offlineIdentityQueue(staff: Staff): Promise<OfflineIdentity[]> {
  return withStaff(staff.userId, async (tx) => {
    const rows = await tx
      .select({
        userId: letterChecks.userId,
        organisationName: organisations.name,
        waitingSince: letterChecks.updatedAt,
        name: users.name,
        email: users.email,
      })
      .from(letterChecks)
      .innerJoin(organisations, eq(organisations.id, letterChecks.organisationId))
      .innerJoin(users, eq(users.id, letterChecks.userId))
      .where(and(eq(letterChecks.method, 'id_document'), eq(letterChecks.status, 'needs_review')))
      .orderBy(asc(letterChecks.updatedAt));
    const seen = new Set<string>();
    return rows.flatMap((row) => {
      if (!row.userId || seen.has(row.userId)) return [];
      seen.add(row.userId);
      return [{ ...row, userId: row.userId }];
    });
  });
}

/**
 * Q55: a person at Gaff saw the original ID, and records the name on it. The person's own check
 * becomes checked, without a selfie, and every workspace they're in gets the copy.
 */
export async function confirmIdentityByStaff(
  staff: Staff,
  userId: string,
  name: { first: string; last: string },
  now = new Date(),
): Promise<void> {
  const first = name.first.trim().slice(0, 60);
  const last = name.last.trim().slice(0, 60);
  if (!first || !last) throw new UserFacingError('Enter the first and last name on the ID.');
  const updated = await withSystem(async (tx) => {
    const [member] = await tx
      .select({ organisationId: memberships.organisationId })
      .from(memberships)
      .where(eq(memberships.userId, userId))
      .limit(1);
    if (!member) return null;
    await scopeToOrg(tx, member.organisationId);
    const [row] = await tx
      .update(identityChecks)
      .set({
        status: 'verified',
        selfie: false,
        provider: 'staff',
        verifiedNameSealed: sealJson({ first, last }),
        reason: null,
        checkedAt: now,
        checkedBy: staff.userId,
      })
      .where(and(eq(identityChecks.userId, userId), eq(identityChecks.status, 'offline')))
      .returning({ id: identityChecks.id });
    if (!row) return null;
    await recordPlatformEvent(tx, {
      type: 'identity.decided',
      actor: { type: 'staff', userId: staff.userId },
      subject: { type: 'identity_check', id: row.id },
      data: { checkId: row.id, outcome: 'verified', selfie: false },
    });
    return row;
  });
  if (!updated) throw new UserFacingError('Someone has already recorded that check.');
  await refreshCopies(userId, now);
}
