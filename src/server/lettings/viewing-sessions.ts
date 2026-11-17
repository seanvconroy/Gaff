import { and, asc, eq, gt, inArray, ne } from 'drizzle-orm';
import { withOrg, type Tx } from '@/db/client';
import {
  applications,
  bookings,
  lettings,
  organisations,
  viewingSessions,
  viewingSlots,
  waitlistOffers,
} from '@/db/schema';
import {
  INVITATION_TEMPLATE,
  WAITLISTED_TEMPLATE,
  invitationEmail,
  waitlistedEmail,
} from '@/copy/templates/invitations';
import { overlaps, slotsFor, type ViewingSession } from '@/domain/viewings/viewing-session';
import { env } from '@/lib/env';
import { formatDateTime } from '@/lib/format';
import { createAccessLink } from '@/server/access/links';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { cancelBookingMessages, queueMessage } from '@/server/messages/outbox';
import { recordEvent } from '@/server/record/events';
import { queueBookingMessages } from '@/server/viewings/booking';

/** Sessions on the same letting never overlap (R1): this one is refused, at its start time. */
async function refuseClash(
  tx: Tx,
  lettingId: string,
  session: { startsAt: Date; endsAt: Date },
  except?: string,
): Promise<void> {
  const existing = await tx
    .select({ startsAt: viewingSessions.startsAt, endsAt: viewingSessions.endsAt })
    .from(viewingSessions)
    .where(
      and(
        eq(viewingSessions.lettingId, lettingId),
        except ? ne(viewingSessions.id, except) : undefined,
      ),
    );
  const clash = existing.find((other) => overlaps(other, session));
  if (clash) {
    throw new UserFacingError(
      `This overlaps the viewing on ${formatDateTime(clash.startsAt)}. Choose another time.`,
      'start',
    );
  }
}

async function insertSlots(
  tx: Tx,
  member: Member,
  lettingId: string,
  sessionId: string,
  session: ViewingSession,
) {
  const slots = slotsFor(session);
  await tx.insert(viewingSlots).values(
    slots.map((slot) => ({
      organisationId: member.organisationId,
      lettingId,
      sessionId,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      capacity: slot.capacity,
    })),
  );
  return slots;
}

/** R1: adds a viewing session to a letting and creates its bookable slots. */
export async function addViewingSession(
  member: Member,
  lettingId: string,
  session: ViewingSession,
): Promise<{ sessionId: string }> {
  return withOrg(member.organisationId, async (tx) => {
    const [letting] = await tx
      .select({ id: lettings.id })
      .from(lettings)
      .where(eq(lettings.id, lettingId))
      .for('update');
    if (!letting) throw new UserFacingError('We couldn’t find that letting.');
    await refuseClash(tx, lettingId, session);

    const [row] = await tx
      .insert(viewingSessions)
      .values({
        organisationId: member.organisationId,
        lettingId,
        kind: session.kind,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        slotMinutes: session.slotMinutes,
        capacity: session.capacity,
        createdBy: member.userId,
      })
      .returning({ id: viewingSessions.id });
    const sessionId = row!.id;
    const slots = await insertSlots(tx, member, lettingId, sessionId, session);

    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'viewings.session_added',
      subject: { type: 'viewing_session', id: sessionId },
      data: {
        sessionId,
        kind: session.kind,
        slots: slots.length,
        places: slots.reduce((sum, slot) => sum + slot.capacity, 0),
      },
    });
    return { sessionId };
  });
}

/**
 * A viewing time about to be changed or cancelled, locked with its letting, and who has booked
 * it. One that has started can't be changed: people may be at the door.
 */
async function lockedSession(tx: Tx, lettingId: string, sessionId: string, doing: string) {
  const [letting] = await tx
    .select({ letting: lettings, organisation: organisations })
    .from(lettings)
    .innerJoin(organisations, eq(organisations.id, lettings.organisationId))
    .where(eq(lettings.id, lettingId))
    .for('update', { of: lettings });
  const [session] = letting
    ? await tx
        .select()
        .from(viewingSessions)
        .where(and(eq(viewingSessions.id, sessionId), eq(viewingSessions.lettingId, lettingId)))
        .for('update')
    : [];
  if (!letting || !session) throw new UserFacingError('That viewing time has already gone.');
  if (session.startsAt <= new Date()) {
    throw new UserFacingError(`This viewing has started, so it can’t be ${doing}.`);
  }
  const slots = await tx
    .select()
    .from(viewingSlots)
    .where(eq(viewingSlots.sessionId, sessionId))
    .orderBy(asc(viewingSlots.startsAt));
  const slotIds = slots.map((slot) => slot.id);
  const booked =
    slotIds.length === 0
      ? []
      : await tx
          .select({ booking: bookings, application: applications })
          .from(bookings)
          .innerJoin(applications, eq(applications.id, bookings.applicationId))
          .where(and(inArray(bookings.slotId, slotIds), eq(bookings.status, 'booked')));
  const offers =
    slotIds.length === 0
      ? []
      : await tx
          .select()
          .from(waitlistOffers)
          .where(and(inArray(waitlistOffers.slotId, slotIds), eq(waitlistOffers.status, 'open')));
  return { ...letting, session, slots, slotIds, booked, offers };
}

/** What's left of slots once they go: old cancelled bookings and finished offers. */
async function clearSlots(tx: Tx, slotIds: string[]): Promise<void> {
  if (slotIds.length === 0) return;
  await tx.delete(bookings).where(inArray(bookings.slotId, slotIds));
  await tx.delete(waitlistOffers).where(inArray(waitlistOffers.slotId, slotIds));
  await tx.delete(viewingSlots).where(inArray(viewingSlots.id, slotIds));
}

/**
 * UX-VW-6: changes a viewing time. Nobody booked: anything about it can change, and its slots
 * are made again. People booked, or a place held for someone on the waiting list: it moves as
 * it is, to another day or start, so each booking keeps its place (R12). Everyone booked hears
 * it has moved, in the fixed confirmation wording, and their reminders move with it (R13).
 */
export async function changeViewingSession(
  member: Member,
  lettingId: string,
  sessionId: string,
  next: ViewingSession,
): Promise<{ moved: boolean; told: number }> {
  return withOrg(member.organisationId, async (tx) => {
    const found = await lockedSession(tx, lettingId, sessionId, 'changed');
    const { session, letting, organisation, booked } = found;
    await refuseClash(tx, lettingId, next, sessionId);

    if (booked.length === 0 && found.offers.length === 0) {
      await clearSlots(tx, found.slotIds);
      await tx
        .update(viewingSessions)
        .set({
          kind: next.kind,
          startsAt: next.startsAt,
          endsAt: next.endsAt,
          slotMinutes: next.slotMinutes,
          capacity: next.capacity,
        })
        .where(eq(viewingSessions.id, sessionId));
      await insertSlots(tx, member, lettingId, sessionId, next);
      await recordEvent(tx, {
        organisationId: member.organisationId,
        lettingId,
        actor: { type: 'person', userId: member.userId },
        type: 'viewings.session_changed',
        subject: { type: 'viewing_session', id: sessionId },
        data: { sessionId, moved: false, told: 0 },
      });
      return { moved: false, told: 0 };
    }

    const sameShape =
      next.kind === session.kind &&
      next.slotMinutes === session.slotMinutes &&
      next.capacity === session.capacity &&
      next.endsAt.getTime() - next.startsAt.getTime() ===
        session.endsAt.getTime() - session.startsAt.getTime();
    if (!sameShape) {
      throw new UserFacingError(
        'People are booked for this time, so only its day and start can change.',
        'start',
      );
    }
    const shift = next.startsAt.getTime() - session.startsAt.getTime();
    if (shift === 0) return { moved: false, told: 0 };
    const moved = (at: Date) => new Date(at.getTime() + shift);
    await tx
      .update(viewingSessions)
      .set({ startsAt: next.startsAt, endsAt: next.endsAt })
      .where(eq(viewingSessions.id, sessionId));
    for (const slot of found.slots) {
      await tx
        .update(viewingSlots)
        .set({ startsAt: moved(slot.startsAt), endsAt: moved(slot.endsAt) })
        .where(eq(viewingSlots.id, slot.id));
    }
    const slotStart = new Map(found.slots.map((slot) => [slot.id, moved(slot.startsAt)]));
    for (const { booking, application } of booked) {
      await cancelBookingMessages(tx, booking.id);
      await queueBookingMessages(tx, {
        organisationId: member.organisationId,
        operatorName: organisation.name,
        letting,
        application,
        bookingId: booking.id,
        startsAt: slotStart.get(booking.slotId)!,
        rescheduled: true,
        sms: application.smsReminders ? application.phoneE164 : null,
      });
    }
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'viewings.session_changed',
      subject: { type: 'viewing_session', id: sessionId },
      data: { sessionId, moved: true, told: booked.length },
    });
    return { moved: true, told: booked.length };
  });
}

/**
 * UX-VW-6: cancels a viewing time. Each person booked is told, with the fixed wording they had
 * before: someone invited gets the invitation again, with the other times, and books one of
 * them (R11, R12); someone who had taken a freed place goes back onto the waiting list, in
 * their place (R14). Their reminders end. Nobody is chosen, invited or removed here (rule 1):
 * everyone keeps the standing a person gave them.
 *
 * If people are booked and there's no other time to offer them, it's refused: add one first.
 */
export async function removeViewingSession(
  member: Member,
  lettingId: string,
  sessionId: string,
): Promise<{ told: number }> {
  return withOrg(member.organisationId, async (tx) => {
    const found = await lockedSession(tx, lettingId, sessionId, 'cancelled');
    const { letting, organisation, booked } = found;
    const others = await tx
      .select({ startsAt: viewingSessions.startsAt, endsAt: viewingSessions.endsAt })
      .from(viewingSessions)
      .where(
        and(
          eq(viewingSessions.lettingId, lettingId),
          ne(viewingSessions.id, sessionId),
          gt(viewingSessions.startsAt, new Date()),
        ),
      )
      .orderBy(asc(viewingSessions.startsAt));
    if (booked.length > 0 && others.length === 0) {
      throw new UserFacingError(
        'Add another time first, so the people booked have one to move to.',
      );
    }

    const fromWaitlist = new Set(
      booked.length === 0
        ? []
        : (
            await tx
              .select({ applicationId: waitlistOffers.applicationId })
              .from(waitlistOffers)
              .where(
                and(
                  inArray(
                    waitlistOffers.applicationId,
                    booked.map((b) => b.application.id),
                  ),
                  eq(waitlistOffers.status, 'taken'),
                ),
              )
          ).map((row) => row.applicationId),
    );
    const base = (application: { fullName: string }) => ({
      renterName: application.fullName,
      operatorName: organisation.name,
      address: letting.addressLine1,
      area: letting.area,
    });
    for (const { booking, application } of booked) {
      await tx
        .update(bookings)
        .set({ status: 'cancelled', cancelledAt: new Date() })
        .where(eq(bookings.id, booking.id));
      await cancelBookingMessages(tx, booking.id);
      const common = {
        organisationId: member.organisationId,
        lettingId,
        applicationId: application.id,
        author: 'template' as const,
        toAddress: application.email,
      };
      if (fromWaitlist.has(application.id)) {
        await tx
          .update(applications)
          .set({ status: 'waitlisted' })
          .where(eq(applications.id, application.id));
        await queueMessage(tx, {
          ...common,
          kind: 'waitlisted',
          templateKey: WAITLISTED_TEMPLATE,
          ...waitlistedEmail(base(application)),
        });
      } else {
        await tx
          .update(applications)
          .set({ status: 'invited' })
          .where(eq(applications.id, application.id));
        const token = await createAccessLink(tx, {
          organisationId: member.organisationId,
          purpose: 'renter',
          subjectId: application.id,
        });
        await queueMessage(tx, {
          ...common,
          kind: 'invitation',
          templateKey: INVITATION_TEMPLATE,
          ...invitationEmail({
            ...base(application),
            bookingUrl: `${env().APP_URL}/r/${token}`,
            sessions: others,
          }),
        });
      }
    }

    await clearSlots(tx, found.slotIds);
    await tx.delete(viewingSessions).where(eq(viewingSessions.id, sessionId));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'viewings.session_removed',
      subject: { type: 'viewing_session', id: sessionId },
      data: { sessionId, told: booked.length },
    });
    return { told: booked.length };
  });
}
