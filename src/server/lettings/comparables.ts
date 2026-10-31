import { eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { lettings, rentComparables } from '@/db/schema';
import { COMPARABLES_NEEDED, medianRentCents, type Comparable } from '@/domain/rent/comparables';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';

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
