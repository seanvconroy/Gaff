import { and, asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import { applications, bookings, decisions, events, viewingSlots } from '@/db/schema';
import { inviteToView } from '@/server/shortlist/invite';
import { attendanceFor, markAttendance } from '@/server/viewings/attendance';
import { bookViewing, cancelViewing } from '@/server/viewings/booking';
import { aLiveLetting, aRenterEnquires, createTestMember, tokenInMessage } from './helpers';

/** A live letting where one invited renter has booked the first slot. */
async function aBookedViewing() {
  const member = await createTestMember();
  const { lettingId } = await aLiveLetting(member);
  const applicationId = await aRenterEnquires(member, 1, { occupants: '1', hasPets: 'no' });
  await inviteToView(member, lettingId, { chosenIds: [applicationId], waitlistSize: 0 });
  const [slot] = await withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(viewingSlots)
      .where(eq(viewingSlots.lettingId, lettingId))
      .orderBy(asc(viewingSlots.startsAt))
      .limit(1),
  );
  const token = await tokenInMessage(member, applicationId, 'invitation');
  expect((await bookViewing(token, slot!.id)).ok).toBe(true);
  const [booking] = await withOrg(member.organisationId, (tx) =>
    tx.select().from(bookings).where(eq(bookings.applicationId, applicationId)),
  );
  /** Moves the viewing so it started a few minutes ago. */
  const startNow = () =>
    withOrg(member.organisationId, (tx) =>
      tx
        .update(viewingSlots)
        .set({
          startsAt: new Date(Date.now() - 5 * 60_000),
          endsAt: new Date(Date.now() + 10 * 60_000),
        })
        .where(eq(viewingSlots.id, slot!.id)),
    );
  return { member, lettingId, applicationId, booking: booking!, token, startNow };
}

async function stateOf(
  member: Awaited<ReturnType<typeof createTestMember>>,
  applicationId: string,
) {
  return withOrg(member.organisationId, async (tx) => {
    const [application] = await tx
      .select({ status: applications.status })
      .from(applications)
      .where(eq(applications.id, applicationId));
    const [booking] = await tx
      .select()
      .from(bookings)
      .where(eq(bookings.applicationId, applicationId));
    const marks = await tx
      .select()
      .from(decisions)
      .where(eq(decisions.kind, 'mark_attendance'))
      .orderBy(asc(decisions.decidedAt));
    const logged = await tx
      .select()
      .from(events)
      .where(eq(events.type, 'viewing.attendance_marked'));
    return { application: application!.status, booking: booking!, marks, logged };
  });
}

describe('R15: a person marks who came, one tap per person', () => {
  it('can’t be marked before the viewing', async () => {
    const { member, lettingId, booking } = await aBookedViewing();
    await expect(
      markAttendance(member, { lettingId, bookingId: booking.id, attended: true }),
    ).rejects.toThrow(/You can mark who came from \d/);
  });

  it('records the mark as the person’s decision, logged with IDs only', async () => {
    const { member, lettingId, applicationId, booking, startNow } = await aBookedViewing();
    await startNow();
    await markAttendance(member, { lettingId, bookingId: booking.id, attended: true });
    const state = await stateOf(member, applicationId);
    expect(state.application).toBe('attended');
    expect(state.booking).toMatchObject({ status: 'attended', attendanceMarkedBy: member.userId });
    expect(state.marks).toHaveLength(1);
    expect(state.marks[0]).toMatchObject({ decidedBy: member.userId, lettingId });
    expect(state.logged[0]?.data).toEqual({
      decisionId: state.marks[0]!.id,
      bookingId: booking.id,
      slotId: booking.slotId,
      attended: true,
    });
  });

  it('can be changed, and a second tap on the same answer changes nothing', async () => {
    const { member, lettingId, applicationId, booking, startNow } = await aBookedViewing();
    await startNow();
    await markAttendance(member, { lettingId, bookingId: booking.id, attended: false });
    await markAttendance(member, { lettingId, bookingId: booking.id, attended: false });
    expect((await stateOf(member, applicationId)).application).toBe('no_show');
    await markAttendance(member, { lettingId, bookingId: booking.id, attended: true });
    const state = await stateOf(member, applicationId);
    expect(state.application).toBe('attended');
    expect(state.marks).toHaveLength(2);
  });

  it('lists the people booked, in time order, and leaves out cancellations', async () => {
    const { member, lettingId, booking, token } = await aBookedViewing();
    expect(await attendanceFor(member, lettingId)).toEqual([
      expect.objectContaining({ bookingId: booking.id, status: 'booked', name: 'Renter 1' }),
    ]);
    await cancelViewing(token);
    expect(await attendanceFor(member, lettingId)).toEqual([]);
    await expect(
      markAttendance(member, { lettingId, bookingId: booking.id, attended: true }),
    ).rejects.toThrow('That viewing was cancelled');
  });

  it('is only possible for the operator’s own viewings', async () => {
    const { lettingId, booking, startNow } = await aBookedViewing();
    await startNow();
    const stranger = await createTestMember();
    await expect(
      markAttendance(stranger, { lettingId, bookingId: booking.id, attended: true }),
    ).rejects.toThrow('We couldn’t find that viewing');
    const theirs = await withOrg(stranger.organisationId, (tx) =>
      tx
        .select()
        .from(bookings)
        .where(and(eq(bookings.id, booking.id))),
    );
    expect(theirs).toEqual([]);
  });
});
