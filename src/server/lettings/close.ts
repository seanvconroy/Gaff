import { and, eq, gt, inArray, isNull, ne } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import {
  applications,
  bookings,
  lettings,
  messages,
  offers,
  organisations,
  viewingSlots,
  waitlistOffers,
} from '@/db/schema';
import { LETTING_CLOSED_TEMPLATE, lettingClosedEmail } from '@/copy/templates/closing';
import { deletionDateAfterClosing } from '@/domain/retention/retention';
import { env } from '@/lib/env';
import { irishToday } from '@/lib/format';
import type { Member } from '@/server/auth/member';
import { recordDecision } from '@/server/decisions/record-decision';
import { UserFacingError } from '@/server/errors';
import { queueMessage } from '@/server/messages/outbox';
import { recordEvent } from '@/server/record/events';
import { followLetting } from '@/server/listings/follow';

/**
 * R26 (basic): a person closes a letting as let or withdrawn. It ends everyone's chances, so
 * it's their decision (ADR-0007). Everyone who enquired hears back, future viewings and
 * reminders are cancelled, and every application gets its deletion date (Q3).
 */
export async function closeLetting(
  member: Member,
  lettingId: string,
  outcome: 'let' | 'withdrawn',
): Promise<{ told: number; deleteAfter: string }> {
  return withOrg(member.organisationId, async (tx) => {
    const [letting] = await tx
      .select()
      .from(lettings)
      .where(eq(lettings.id, lettingId))
      .for('update');
    if (!letting) throw new UserFacingError('We couldn’t find that letting.');
    if (letting.status !== 'live') {
      throw new UserFacingError('Only a letting that’s taking enquiries can be closed.');
    }
    const [organisation] = await tx
      .select({ name: organisations.name })
      .from(organisations)
      .where(eq(organisations.id, member.organisationId));
    const deleteAfter = deletionDateAfterClosing(irishToday(), env().RETENTION_PERSONAL_DAYS);
    const people = await tx
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.lettingId, lettingId),
          isNull(applications.personalDataDeletedAt),
          ne(applications.status, 'withdrawn'),
        ),
      );

    const decision = await recordDecision(tx, {
      member,
      kind: 'close_letting',
      lettingId,
      basis: { outcome, applications: people.length, deleteAfter },
    });
    await tx
      .update(lettings)
      .set({ status: outcome, stage: 'close', closedAt: new Date() })
      .where(eq(lettings.id, lettingId));
    // M50: the listing closes with the letting.
    await followLetting(tx, lettingId, outcome === 'let' ? 'let' : 'withdrawn');
    await tx
      .update(applications)
      .set({ deleteAfter })
      .where(and(eq(applications.lettingId, lettingId), isNull(applications.deleteAfter)));

    // Nothing more goes out about viewings: future bookings, reminders and offers end here.
    const future = await tx
      .select({ id: bookings.id })
      .from(bookings)
      .innerJoin(viewingSlots, eq(viewingSlots.id, bookings.slotId))
      .where(
        and(
          eq(bookings.lettingId, lettingId),
          eq(bookings.status, 'booked'),
          gt(viewingSlots.startsAt, new Date()),
        ),
      );
    if (future.length > 0) {
      await tx
        .update(bookings)
        .set({ status: 'cancelled', cancelledAt: new Date() })
        .where(
          inArray(
            bookings.id,
            future.map((b) => b.id),
          ),
        );
    }
    await tx
      .update(messages)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(messages.lettingId, lettingId),
          inArray(messages.status, ['scheduled', 'awaiting_approval']),
        ),
      );
    await tx
      .update(waitlistOffers)
      .set({ status: 'closed' })
      .where(and(eq(waitlistOffers.lettingId, lettingId), eq(waitlistOffers.status, 'open')));
    // An offer still open closes with the letting: it can't be accepted any more.
    await tx
      .update(offers)
      .set({ status: 'expired' })
      .where(and(eq(offers.lettingId, lettingId), eq(offers.status, 'open')));

    for (const person of people) {
      await queueMessage(tx, {
        organisationId: member.organisationId,
        lettingId,
        applicationId: person.id,
        kind: 'letting_closed',
        author: 'template',
        templateKey: LETTING_CLOSED_TEMPLATE,
        toAddress: person.email,
        ...lettingClosedEmail({
          renterName: person.fullName,
          operatorName: organisation!.name,
          address: letting.addressLine1,
          area: letting.area,
          outcome,
          deleteOn: deleteAfter,
        }),
      });
    }
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'letting.closed',
      subject: { type: 'decision', id: decision.id },
      data: { decisionId: decision.id, outcome, told: people.length, deleteAfter },
    });
    return { told: people.length, deleteAfter };
  });
}
