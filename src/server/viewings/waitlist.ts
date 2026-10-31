import { and, asc, count, eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import {
  applications,
  bookings,
  lettings,
  organisations,
  viewingSlots,
  waitlistOffers,
} from '@/db/schema';
import { PLACE_OFFERED_TEMPLATE, placeOfferedEmail } from '@/copy/templates/viewings';
import { placesLeft } from '@/domain/viewings/booking';
import { chooseOffers, planOffer } from '@/domain/viewings/waitlist';
import { env } from '@/lib/env';
import { createAccessLink } from '@/server/access/links';
import { enqueue } from '@/server/jobs/enqueue';
import { queueMessage } from '@/server/messages/outbox';
import { recordEvent } from '@/server/record/events';

/**
 * R14: offers a slot's free places to the waiting list a person approved (R11), following Q2.
 * Runs after a cancellation and again when a hold runs out. Only ever offers to that list.
 */
export async function offerFreedPlace(organisationId: string, slotId: string): Promise<void> {
  await withOrg(organisationId, async (tx) => {
    const [found] = await tx
      .select({ lettingId: viewingSlots.lettingId })
      .from(viewingSlots)
      .where(eq(viewingSlots.id, slotId));
    if (!found) return;
    // One offer round per letting at a time, so nobody is offered two places at once. The
    // slot is locked too, as bookings lock it while they count places.
    const [letting] = await tx
      .select()
      .from(lettings)
      .where(eq(lettings.id, found.lettingId))
      .for('update');
    const [slot] = await tx
      .select()
      .from(viewingSlots)
      .where(eq(viewingSlots.id, slotId))
      .for('update');
    if (!slot || !letting) return;
    const [taken] = await tx
      .select({ n: count() })
      .from(bookings)
      .where(and(eq(bookings.slotId, slotId), eq(bookings.status, 'booked')));
    const offers = await tx
      .select()
      .from(waitlistOffers)
      .where(eq(waitlistOffers.lettingId, slot.lettingId));
    const thisSlot = offers.filter((o) => o.slotId === slotId);
    const plan = planOffer(slot.startsAt, new Date());
    const waitlisted = await tx
      .select()
      .from(applications)
      .where(and(eq(applications.lettingId, slot.lettingId), eq(applications.status, 'waitlisted')))
      .orderBy(asc(applications.waitlistPosition));
    const people = chooseOffers({
      plan,
      free: placesLeft({ capacity: slot.capacity, booked: taken?.n ?? 0 }),
      open: thisSlot.filter((o) => o.status === 'open'),
      offered: new Set(thisSlot.map((o) => o.applicationId)),
      holding: new Set(
        offers
          .filter((o) => o.slotId !== slotId && o.status === 'open')
          .map((o) => o.applicationId),
      ),
      waitlisted,
    });
    if (people.length === 0 || plan.mode === 'too_late') return;

    const [organisation] = await tx
      .select()
      .from(organisations)
      .where(eq(organisations.id, organisationId));
    for (const person of people) {
      const [offer] = await tx
        .insert(waitlistOffers)
        .values({
          organisationId,
          lettingId: slot.lettingId,
          slotId,
          applicationId: person.id,
          mode: plan.mode,
          expiresAt: plan.mode === 'one_at_a_time' ? plan.expiresAt : null,
        })
        .returning({ id: waitlistOffers.id });
      const token = await createAccessLink(tx, {
        organisationId,
        purpose: 'renter',
        subjectId: person.id,
      });
      await queueMessage(tx, {
        organisationId,
        lettingId: slot.lettingId,
        applicationId: person.id,
        kind: 'place_offered',
        author: 'template',
        templateKey: PLACE_OFFERED_TEMPLATE,
        toAddress: person.email,
        ...placeOfferedEmail({
          renterName: person.fullName,
          operatorName: organisation!.name,
          address: letting.addressLine1,
          area: letting.area,
          startsAt: slot.startsAt,
          manageUrl: `${env().APP_URL}/r/${token}`,
          everyone: plan.mode === 'everyone',
          holdUntil: plan.mode === 'one_at_a_time' ? plan.expiresAt : null,
        }),
      });
      if (plan.mode === 'one_at_a_time') {
        await enqueue(
          tx,
          'expire_offer',
          { organisationId, offerId: offer!.id },
          { runAt: plan.expiresAt, jobKey: `expire:${offer!.id}` },
        );
      }
    }
    await recordEvent(tx, {
      organisationId,
      lettingId: slot.lettingId,
      actor: { type: 'system' },
      type: 'waitlist.offered',
      subject: { type: 'viewing_slot', id: slotId },
      data: { slotId, mode: plan.mode, offered: people.length },
    });
  });
}

/** R14: when a hold runs out unused, the place moves on down the list. */
export async function expireOffer(input: {
  organisationId: string;
  offerId: string;
}): Promise<void> {
  const slotId = await withOrg(input.organisationId, async (tx) => {
    const [offer] = await tx
      .update(waitlistOffers)
      .set({ status: 'expired' })
      .where(and(eq(waitlistOffers.id, input.offerId), eq(waitlistOffers.status, 'open')))
      .returning({ slotId: waitlistOffers.slotId });
    return offer?.slotId ?? null;
  });
  if (slotId) await offerFreedPlace(input.organisationId, slotId);
}
