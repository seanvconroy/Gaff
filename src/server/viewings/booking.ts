import { and, asc, count, eq } from 'drizzle-orm';
import { withOrg, type Tx } from '@/db/client';
import {
  applications,
  bookings,
  lettings,
  organisations,
  viewingSlots,
  waitlistOffers,
} from '@/db/schema';
import {
  BOOKING_CONFIRMATION_TEMPLATE,
  REMINDER_SMS_TEMPLATE,
  REMINDER_TEMPLATE,
  bookingConfirmationEmail,
  reminderEmail,
  reminderSms,
} from '@/copy/templates/viewings';
import { normalisePhone } from '@/domain/enquiries/parse';
import { BOOKING_CUTOFF_MINUTES, placesLeft, reminderTimes } from '@/domain/viewings/booking';
import { heldForOthers } from '@/domain/viewings/waitlist';
import { env } from '@/lib/env';
import { createAccessLink, resolveAccessLink } from '@/server/access/links';
import { enqueue } from '@/server/jobs/enqueue';
import { cancelBookingMessages, queueMessage } from '@/server/messages/outbox';
import { recordEvent } from '@/server/record/events';

/** Open waiting-list offers on a letting's slots (R14). */
export async function openOffers(tx: Tx, where: { lettingId: string } | { slotId: string }) {
  return tx
    .select({
      id: waitlistOffers.id,
      slotId: waitlistOffers.slotId,
      applicationId: waitlistOffers.applicationId,
      mode: waitlistOffers.mode,
    })
    .from(waitlistOffers)
    .where(
      and(
        'slotId' in where
          ? eq(waitlistOffers.slotId, where.slotId)
          : eq(waitlistOffers.lettingId, where.lettingId),
        eq(waitlistOffers.status, 'open'),
      ),
    );
}

/**
 * Every slot for a letting with how many places are taken (R12), as one renter sees it: a
 * place held for someone else on the waiting list counts as taken (R14).
 */
export async function slotAvailability(tx: Tx, lettingId: string, forApplicationId: string) {
  const slots = await tx
    .select()
    .from(viewingSlots)
    .where(eq(viewingSlots.lettingId, lettingId))
    .orderBy(asc(viewingSlots.startsAt));
  const taken = await tx
    .select({ slotId: bookings.slotId, n: count() })
    .from(bookings)
    .where(and(eq(bookings.lettingId, lettingId), eq(bookings.status, 'booked')))
    .groupBy(bookings.slotId);
  const open = await openOffers(tx, { lettingId });
  const bySlot = new Map(taken.map((t) => [t.slotId, t.n]));
  return slots.map((slot) => ({
    ...slot,
    booked:
      (bySlot.get(slot.id) ?? 0) +
      heldForOthers(
        open.filter((o) => o.slotId === slot.id),
        forApplicationId,
      ),
  }));
}

export async function currentBooking(tx: Tx, applicationId: string) {
  const [row] = await tx
    .select({ booking: bookings, slot: viewingSlots })
    .from(bookings)
    .innerJoin(viewingSlots, eq(viewingSlots.id, bookings.slotId))
    .where(and(eq(bookings.applicationId, applicationId), eq(bookings.status, 'booked')));
  return row ?? null;
}

export type BookResult =
  | { ok: true; rescheduled: boolean }
  | { ok: false; reason: 'invalid_link' | 'not_invited' | 'full' | 'too_late' | 'invalid_phone' };

/**
 * R12: a renter books (or moves) their viewing from their private link. The slot row is locked
 * while its places are counted, so two people can't take the last place. R13: confirmation and
 * reminders are queued in the same transaction.
 */
export async function bookViewing(
  token: string,
  slotId: string,
  mobile?: string,
): Promise<BookResult> {
  const link = await resolveAccessLink(token, 'renter');
  if (!link) return { ok: false, reason: 'invalid_link' };
  const phoneE164 = mobile?.trim() ? normalisePhone(mobile) : null;
  if (mobile?.trim() && !phoneE164) return { ok: false, reason: 'invalid_phone' };

  return withOrg(link.organisationId, async (tx) => {
    const [row] = await tx
      .select({ application: applications, letting: lettings, organisation: organisations })
      .from(applications)
      .innerJoin(lettings, eq(lettings.id, applications.lettingId))
      .innerJoin(organisations, eq(organisations.id, applications.organisationId))
      .where(eq(applications.id, link.subjectId))
      .for('update', { of: applications });
    if (!row) return { ok: false, reason: 'not_invited' };
    // R14: someone on the waiting list can book only the place they've been offered.
    const [offer] =
      row.application.status === 'waitlisted'
        ? await tx
            .select()
            .from(waitlistOffers)
            .where(
              and(
                eq(waitlistOffers.applicationId, row.application.id),
                eq(waitlistOffers.slotId, slotId),
                eq(waitlistOffers.status, 'open'),
              ),
            )
        : [];
    if (!['invited', 'booked'].includes(row.application.status) && !offer) {
      return { ok: false, reason: 'not_invited' };
    }
    const { application, letting, organisation } = row;

    const [slot] = await tx
      .select()
      .from(viewingSlots)
      .where(and(eq(viewingSlots.id, slotId), eq(viewingSlots.lettingId, letting.id)))
      .for('update');
    if (!slot) return { ok: false, reason: 'full' };
    if (slot.startsAt.getTime() <= Date.now() + BOOKING_CUTOFF_MINUTES * 60_000) {
      return { ok: false, reason: 'too_late' };
    }
    const [taken] = await tx
      .select({ n: count() })
      .from(bookings)
      .where(and(eq(bookings.slotId, slotId), eq(bookings.status, 'booked')));
    const booked = taken?.n ?? 0;
    const open = await openOffers(tx, { slotId });
    const existing = await currentBooking(tx, application.id);
    if (existing?.slot.id === slotId) return { ok: true, rescheduled: false };
    // R14: a place held for someone on the waiting list isn't free for anyone else.
    const held = heldForOthers(open, application.id);
    if (placesLeft({ capacity: slot.capacity, booked: booked + held }) === 0) {
      return { ok: false, reason: 'full' };
    }

    if (existing) {
      await tx
        .update(bookings)
        .set({ status: 'cancelled', cancelledAt: new Date() })
        .where(eq(bookings.id, existing.booking.id));
      await cancelBookingMessages(tx, existing.booking.id);
    }
    const [booking] = await tx
      .insert(bookings)
      .values({
        organisationId: link.organisationId,
        lettingId: letting.id,
        slotId,
        applicationId: application.id,
      })
      .returning({ id: bookings.id });
    await tx
      .update(applications)
      .set({
        status: 'booked',
        ...(phoneE164 ? { phoneE164, phone: mobile!.trim(), smsReminders: true } : {}),
      })
      .where(eq(applications.id, application.id));
    if (offer) {
      await tx
        .update(waitlistOffers)
        .set({ status: 'taken' })
        .where(eq(waitlistOffers.id, offer.id));
    }
    if (placesLeft({ capacity: slot.capacity, booked: booked + 1 }) === 0) {
      // The slot is full, so any other offer of a place on it is gone.
      await tx
        .update(waitlistOffers)
        .set({ status: 'closed' })
        .where(and(eq(waitlistOffers.slotId, slotId), eq(waitlistOffers.status, 'open')));
    }

    const manageUrl = `${env().APP_URL}/r/${await createAccessLink(tx, {
      organisationId: link.organisationId,
      purpose: 'renter',
      subjectId: application.id,
    })}`;
    const viewing = {
      renterName: application.fullName,
      operatorName: organisation.name,
      address: letting.addressLine1,
      area: letting.area,
      startsAt: slot.startsAt,
      manageUrl,
    };
    const common = {
      organisationId: link.organisationId,
      lettingId: letting.id,
      applicationId: application.id,
      author: 'template' as const,
      bookingId: booking!.id,
    };
    await queueMessage(tx, {
      ...common,
      kind: 'booking_confirmation',
      templateKey: BOOKING_CONFIRMATION_TEMPLATE,
      toAddress: application.email,
      ...bookingConfirmationEmail({ ...viewing, rescheduled: Boolean(existing) }),
    });
    // Q12: text reminders only to a number the renter gave for them when booking.
    const sms = phoneE164 ?? (application.smsReminders ? application.phoneE164 : null);
    for (const reminder of reminderTimes(slot.startsAt, new Date())) {
      await queueMessage(tx, {
        ...common,
        kind: 'reminder',
        templateKey: REMINDER_TEMPLATE,
        toAddress: application.email,
        sendAt: reminder.sendAt,
        ...reminderEmail({ ...viewing, when: reminder.kind }),
      });
      if (reminder.kind === 'two_hours' && sms) {
        await queueMessage(tx, {
          ...common,
          kind: 'reminder',
          channel: 'sms',
          templateKey: REMINDER_SMS_TEMPLATE,
          toAddress: sms,
          subject: '',
          body: reminderSms(viewing),
          sendAt: reminder.sendAt,
        });
      }
    }
    await recordEvent(tx, {
      organisationId: link.organisationId,
      lettingId: letting.id,
      actor: { type: 'renter', applicationId: application.id },
      type: 'viewing.booked',
      subject: { type: 'booking', id: booking!.id },
      data: { bookingId: booking!.id, slotId, rescheduled: Boolean(existing) },
    });
    return { ok: true, rescheduled: Boolean(existing) };
  });
}

/**
 * R12: a renter cancels their viewing. The freed place goes to the waiting list (R14), from a
 * job queued in the same transaction, so it's never lost. Someone who came off the waiting
 * list goes back onto it, in their place.
 */
export async function cancelViewing(token: string): Promise<{ ok: boolean }> {
  const link = await resolveAccessLink(token, 'renter');
  if (!link) return { ok: false };
  return withOrg(link.organisationId, async (tx) => {
    const existing = await currentBooking(tx, link.subjectId);
    if (!existing) return { ok: false };
    await tx
      .update(bookings)
      .set({ status: 'cancelled', cancelledAt: new Date() })
      .where(eq(bookings.id, existing.booking.id));
    await cancelBookingMessages(tx, existing.booking.id);
    const [fromWaitlist] = await tx
      .select({ id: waitlistOffers.id })
      .from(waitlistOffers)
      .where(
        and(eq(waitlistOffers.applicationId, link.subjectId), eq(waitlistOffers.status, 'taken')),
      )
      .limit(1);
    await tx
      .update(applications)
      .set({ status: fromWaitlist ? 'waitlisted' : 'invited' })
      .where(eq(applications.id, link.subjectId));
    await enqueue(
      tx,
      'offer_place',
      { organisationId: link.organisationId, slotId: existing.slot.id },
      { jobKey: `offer_place:${existing.slot.id}` },
    );
    await recordEvent(tx, {
      organisationId: link.organisationId,
      lettingId: existing.booking.lettingId,
      actor: { type: 'renter', applicationId: link.subjectId },
      type: 'viewing.cancelled',
      subject: { type: 'booking', id: existing.booking.id },
      data: { bookingId: existing.booking.id, slotId: existing.slot.id },
    });
    return { ok: true };
  });
}
