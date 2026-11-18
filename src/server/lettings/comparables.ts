import { and, eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { lettings, rentComparables } from '@/db/schema';
import { COMPARABLES_NEEDED, medianRentCents, type Comparable } from '@/domain/rent/comparables';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';
import { assertMayActOn } from '@/server/team/permissions';

/** R4: records the three comparable rents, replacing any recorded before. */
export async function recordComparables(
  member: Member,
  lettingId: string,
  comparables: Comparable[],
): Promise<void> {
  if (comparables.length !== COMPARABLES_NEEDED) {
    throw new UserFacingError('Add three comparable rents.');
  }
  await withOrg(member.organisationId, async (tx) => {
    await assertMayActOn(tx, member, lettingId);
    const [letting] = await tx
      .select({ id: lettings.id })
      .from(lettings)
      .where(eq(lettings.id, lettingId))
      .for('update');
    if (!letting) throw new UserFacingError('We couldn’t find that letting.');

    await tx.delete(rentComparables).where(eq(rentComparables.lettingId, lettingId));
    await tx.insert(rentComparables).values(
      comparables.map((comparable, index) => ({
        organisationId: member.organisationId,
        lettingId,
        position: index + 1,
        area: comparable.area,
        propertyType: comparable.propertyType,
        bedrooms: comparable.bedrooms,
        monthlyRentCents: comparable.monthlyRentCents,
        registeredOn: comparable.registeredOn ?? null,
        addedBy: member.userId,
      })),
    );
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'comparables.recorded',
      subject: { type: 'letting', id: lettingId },
      data: { count: comparables.length, medianRentCents: medianRentCents(comparables) },
    });
  });
}

/**
 * UX-LP-14: one comparable home, entered on its own screen (`position` 1 to 3), replacing the
 * one entered there before. Once all three are in, the set is recorded as before (R4), so the
 * rent-setting pack and the letting's record read as they did.
 */
export async function recordComparable(
  member: Member,
  lettingId: string,
  position: number,
  comparable: Comparable,
): Promise<{ count: number }> {
  if (!Number.isInteger(position) || position < 1 || position > COMPARABLES_NEEDED) {
    throw new UserFacingError('There are three comparable rents to add.');
  }
  return withOrg(member.organisationId, async (tx) => {
    await assertMayActOn(tx, member, lettingId);
    const [letting] = await tx
      .select({ id: lettings.id })
      .from(lettings)
      .where(eq(lettings.id, lettingId))
      .for('update');
    if (!letting) throw new UserFacingError('We couldn’t find that letting.');
    await tx
      .delete(rentComparables)
      .where(and(eq(rentComparables.lettingId, lettingId), eq(rentComparables.position, position)));
    await tx.insert(rentComparables).values({
      organisationId: member.organisationId,
      lettingId,
      position,
      area: comparable.area,
      propertyType: comparable.propertyType,
      bedrooms: comparable.bedrooms,
      monthlyRentCents: comparable.monthlyRentCents,
      registeredOn: comparable.registeredOn ?? null,
      addedBy: member.userId,
    });
    const all = await tx
      .select({ monthlyRentCents: rentComparables.monthlyRentCents })
      .from(rentComparables)
      .where(eq(rentComparables.lettingId, lettingId));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'comparable.recorded',
      subject: { type: 'letting', id: lettingId },
      data: { position, count: all.length },
    });
    if (all.length === COMPARABLES_NEEDED) {
      await recordEvent(tx, {
        organisationId: member.organisationId,
        lettingId,
        actor: { type: 'person', userId: member.userId },
        type: 'comparables.recorded',
        subject: { type: 'letting', id: lettingId },
        data: { count: all.length, medianRentCents: medianRentCents(all) },
      });
    }
    return { count: all.length };
  });
}
