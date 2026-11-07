import { eq, min } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { applications, lettings, tenancies } from '@/db/schema';
import { daysSince } from '@/domain/dashboard/time';
import { deletionDateAfterClosing } from '@/domain/retention/retention';
import { canFinish } from '@/domain/tenancy/steps';
import { env } from '@/lib/env';
import { irishToday } from '@/lib/format';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';
import { followLetting } from '@/server/listings/follow';

/**
 * R26, stage 9: the operator finishes a let home. The letting record is archived (it stays,
 * with no personal details in it), and the tenant's details in Gaff get their deletion date,
 * so the operator saves the signed agreement and packs first. Days to let are recorded (R28).
 */
export async function finishLetting(
  member: Member,
  lettingId: string,
): Promise<{ deleteAfter: string; daysToLet: number | null }> {
  return withOrg(member.organisationId, async (tx) => {
    const [tenancy] = await tx.select().from(tenancies).where(eq(tenancies.lettingId, lettingId));
    if (!tenancy) throw new UserFacingError('There’s no tenancy for this home yet.');
    if (!canFinish(tenancy)) {
      throw new UserFacingError('Finish once the agreement is signed and the payment is in.');
    }
    const now = new Date();
    const deleteAfter = deletionDateAfterClosing(irishToday(), env().RETENTION_PERSONAL_DAYS);
    await tx.update(tenancies).set({ closedAt: now }).where(eq(tenancies.id, tenancy.id));
    await tx
      .update(lettings)
      .set({ stage: 'close', closedAt: now })
      .where(eq(lettings.id, lettingId));
    // M50: the home is let.
    await followLetting(tx, lettingId, 'let');
    await tx
      .update(applications)
      .set({ deleteAfter })
      .where(eq(applications.id, tenancy.applicationId));
    const [first] = await tx
      .select({ at: min(applications.firstEnquiredAt) })
      .from(applications)
      .where(eq(applications.lettingId, lettingId));
    const signedAt = tenancy.operatorSignedAt ?? tenancy.tenantSignedAt;
    const daysToLet = first?.at && signedAt ? daysSince(first.at, signedAt) : null;
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'letting.finished',
      subject: { type: 'tenancy', id: tenancy.id },
      data: { tenancyId: tenancy.id, daysToLet, deleteAfter },
    });
    return { deleteAfter, daysToLet };
  });
}
