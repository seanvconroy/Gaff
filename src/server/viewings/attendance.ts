import { and, asc, eq, inArray } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { applications, bookings, viewingSlots } from '@/db/schema';
import { attendanceOpensAt, canMarkAttendance } from '@/domain/viewings/attendance';
import { formatTime } from '@/lib/format';
import { cancelApplyInvitation, queueApplyInvitation } from '@/server/applications/apply';
import type { Member } from '@/server/auth/member';
import { recordDecision } from '@/server/decisions/record-decision';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';

/**
 * R15: everyone booked to view a letting, in time order, with whether they came, and (P16)
 * whether they confirmed a mobile.
 */
export async function attendanceFor(member: Member, lettingId: string) {
  return withOrg(member.organisationId, (tx) =>
    tx
      .select({
        bookingId: bookings.id,
        status: bookings.status,
        slotId: viewingSlots.id,
        startsAt: viewingSlots.startsAt,
        name: applications.fullName,
        // P16: the letter sees who booked without confirming a mobile.
        mobileConfirmedAt: applications.mobileConfirmedAt,
      })
      .from(bookings)
      .innerJoin(viewingSlots, eq(viewingSlots.id, bookings.slotId))
      .innerJoin(applications, eq(applications.id, bookings.applicationId))
      .where(
        and(
          eq(bookings.lettingId, lettingId),
          inArray(bookings.status, ['booked', 'attended', 'no_show']),
        ),
      )
      .orderBy(asc(viewingSlots.startsAt), asc(bookings.bookedAt)),
  );
}

/**
 * R15: a person marks whether someone came, in one tap. It's their decision (ADR-0007), since
 * it decides who is asked to apply (R16), and they can change it.
 */
export async function markAttendance(
  member: Member,
  input: { lettingId: string; bookingId: string; attended: boolean },
): Promise<void> {
  await withOrg(member.organisationId, async (tx) => {
    const [row] = await tx
      .select({ booking: bookings, slot: viewingSlots })
      .from(bookings)
      .innerJoin(viewingSlots, eq(viewingSlots.id, bookings.slotId))
      .where(and(eq(bookings.id, input.bookingId), eq(bookings.lettingId, input.lettingId)))
      .for('update', { of: bookings });
    if (!row) throw new UserFacingError('We couldn’t find that viewing.');
    if (row.booking.status === 'cancelled') {
      throw new UserFacingError('That viewing was cancelled, so there’s nothing to mark.');
    }
    if (!canMarkAttendance(row.slot.startsAt, new Date())) {
      throw new UserFacingError(
        `You can mark who came from ${formatTime(attendanceOpensAt(row.slot.startsAt))}.`,
      );
    }
    const status = input.attended ? 'attended' : 'no_show';
    if (row.booking.status === status) return;

    const decision = await recordDecision(tx, {
      member,
      kind: 'mark_attendance',
      lettingId: input.lettingId,
      basis: {
        bookingId: row.booking.id,
        applicationId: row.booking.applicationId,
        attended: input.attended,
        was: row.booking.status,
      },
    });
    await tx
      .update(bookings)
      .set({ status, attendanceMarkedBy: member.userId, attendanceMarkedAt: new Date() })
      .where(eq(bookings.id, row.booking.id));
    await tx
      .update(applications)
      .set({ status })
      .where(eq(applications.id, row.booking.applicationId));
    // R16: someone who came is invited to apply once their viewing ends; if not, it doesn't go.
    if (input.attended) {
      await queueApplyInvitation(tx, {
        organisationId: member.organisationId,
        applicationId: row.booking.applicationId,
        viewingEndsAt: row.slot.endsAt,
      });
    } else {
      await cancelApplyInvitation(tx, row.booking.applicationId);
    }
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId: input.lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'viewing.attendance_marked',
      subject: { type: 'booking', id: row.booking.id },
      data: {
        decisionId: decision.id,
        bookingId: row.booking.id,
        slotId: row.slot.id,
        attended: input.attended,
      },
    });
  });
}
