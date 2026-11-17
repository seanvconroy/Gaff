import { and, asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import {
  applications,
  bookings,
  decisions,
  events,
  messages,
  viewingSessions,
  viewingSlots,
} from '@/db/schema';
import { irishInstant } from '@/lib/format';
import {
  addViewingSession,
  changeViewingSession,
  removeViewingSession,
} from '@/server/lettings/viewing-sessions';
import { inviteToView } from '@/server/shortlist/invite';
import { bookViewing } from '@/server/viewings/booking';
import { calendarFor, viewingDetail } from '@/server/viewings/calendar';
import { aViewingSession, daysFromToday } from '../fixtures/lettings';
import { aLiveLetting, aRenterEnquires, createTestMember, tokenInMessage } from './helpers';

type TestMember = Awaited<ReturnType<typeof createTestMember>>;

const week = () => ({
  from: new Date(Date.now() - 86_400_000),
  to: new Date(Date.now() + 14 * 86_400_000),
});

async function sessionsOf(member: TestMember, lettingId: string) {
  return withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(viewingSessions)
      .where(eq(viewingSessions.lettingId, lettingId))
      .orderBy(asc(viewingSessions.startsAt)),
  );
}

async function slotsOf(member: TestMember, sessionId: string) {
  return withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(viewingSlots)
      .where(eq(viewingSlots.sessionId, sessionId))
      .orderBy(asc(viewingSlots.startsAt)),
  );
}

async function sentTo(member: TestMember, applicationId: string) {
  return withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(messages)
      .where(and(eq(messages.applicationId, applicationId), eq(messages.direction, 'outbound')))
      .orderBy(asc(messages.createdAt)),
  );
}

/** A live letting with one evening of slots, and one invited renter booked on its first slot. */
async function aBookedEvening() {
  const member = await createTestMember();
  const { lettingId } = await aLiveLetting(member);
  const applicationId = await aRenterEnquires(member, 1, { occupants: '1', hasPets: 'no' });
  await inviteToView(member, lettingId, { chosenIds: [applicationId], waitlistSize: 0 });
  const [session] = await sessionsOf(member, lettingId);
  const [slot] = await slotsOf(member, session!.id);
  const token = await tokenInMessage(member, applicationId, 'invitation');
  expect((await bookViewing(token, slot!.id, '086 765 4321')).ok).toBe(true);
  return { member, lettingId, applicationId, session: session!, slot: slot! };
}

describe('UX-VW-1: the calendar across every home', () => {
  it('UX-VW-1: lists each home’s viewing times with how many are booked and who waits', async () => {
    const { member, lettingId, session } = await aBookedEvening();
    const other = await aLiveLetting(member, { addressLine1: '4 Harbour View' });
    const { viewings, homes } = await calendarFor(member, week());
    expect(viewings.map((v) => [v.address, v.places, v.booked, v.toMark])).toEqual(
      expect.arrayContaining([
        ['12 Ranelagh Road', 4, 1, 1],
        ['4 Harbour View', 4, 0, 0],
      ]),
    );
    expect(viewings.find((v) => v.sessionId === session.id)?.lettingId).toBe(lettingId);
    expect(homes.map((h) => h.id).sort()).toEqual([lettingId, other.lettingId].sort());
    // UX-VW-3: the next time opens with the last settings used for the home.
    expect(homes.find((h) => h.id === lettingId)?.last).toMatchObject({
      kind: 'slots',
      start: '18:00',
      end: '19:00',
      slotMinutes: 15,
    });
  });

  it('UX-VW-1: never shows another organisation’s viewings', async () => {
    const ours = await createTestMember();
    await aLiveLetting(ours);
    const theirs = await createTestMember();
    expect((await calendarFor(theirs, week())).viewings).toEqual([]);
  });

  it('UX-VW-4: suggests two times for a live home with people waiting and no times to come', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    const [session] = await sessionsOf(member, lettingId);
    await removeViewingSession(member, lettingId, session!.id);
    expect((await calendarFor(member, week())).homes[0]!.suggestions).toEqual([]);
    await aRenterEnquires(member, 1);
    const [home] = (await calendarFor(member, week())).homes;
    expect(home!.suggestions).toHaveLength(2);
    expect(home!.suggestions.map((s) => [s.start, s.end])).toEqual(
      expect.arrayContaining([
        ['18:00', '19:00'],
        ['11:00', '12:00'],
      ]),
    );
  });
});

describe('UX-VW-6: changing a viewing time', () => {
  it('UX-VW-6: with nobody booked, anything about it can change, and its slots are made again', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    const [session] = await sessionsOf(member, lettingId);
    const next = aViewingSession({ date: daysFromToday(8), kind: 'group', capacity: '6' });
    expect(await changeViewingSession(member, lettingId, session!.id, next)).toEqual({
      moved: false,
      told: 0,
    });
    const slots = await slotsOf(member, session!.id);
    expect(slots.map((s) => s.capacity)).toEqual([6]);
    expect(slots[0]!.startsAt).toEqual(next.startsAt);
  });

  it('UX-VW-6, R12, R13: with people booked it moves as it is; each is told and their reminders move', async () => {
    const { member, lettingId, applicationId, session, slot } = await aBookedEvening();
    const date = daysFromToday(9);
    const next = aViewingSession({ date, start: '11:00', end: '12:00' });
    expect(await changeViewingSession(member, lettingId, session.id, next)).toEqual({
      moved: true,
      told: 1,
    });
    const [moved] = await slotsOf(member, session.id);
    expect(moved!.id).toBe(slot.id);
    expect(moved!.startsAt).toEqual(irishInstant(date, '11:00'));
    const [booking] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(bookings).where(eq(bookings.applicationId, applicationId)),
    );
    expect(booking).toMatchObject({ slotId: slot.id, status: 'booked' });
    const sent = await sentTo(member, applicationId);
    const confirmations = sent.filter((m) => m.kind === 'booking_confirmation');
    expect(confirmations.at(-1)!.body).toContain('Your viewing has moved.');
    const reminders = sent.filter((m) => m.kind === 'reminder');
    expect(reminders.filter((m) => m.status === 'cancelled')).toHaveLength(3);
    const scheduled = reminders.filter((m) => m.status === 'scheduled');
    expect(scheduled.map((m) => m.channel).sort()).toEqual(['email', 'email', 'sms']);
    expect(
      scheduled.find((m) => m.channel === 'sms')!.sendAt!.getTime() -
        irishInstant(date, '11:00').getTime(),
    ).toBe(-2 * 3_600_000);
  });

  it('UX-VW-6: with people booked, its length and how people view can’t change', async () => {
    const { member, lettingId, session } = await aBookedEvening();
    await expect(
      changeViewingSession(
        member,
        lettingId,
        session.id,
        aViewingSession({ date: daysFromToday(9), end: '19:30' }),
      ),
    ).rejects.toThrow('only its day and start can change');
  });

  it('R1: a change can’t overlap another of the home’s viewing times', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    await addViewingSession(member, lettingId, aViewingSession({ date: daysFromToday(10) }));
    const [first] = await sessionsOf(member, lettingId);
    await expect(
      changeViewingSession(
        member,
        lettingId,
        first!.id,
        aViewingSession({ date: daysFromToday(10), start: '18:30', end: '19:30' }),
      ),
    ).rejects.toThrow('This overlaps');
  });
});

describe('UX-VW-6: cancelling a viewing time', () => {
  it('UX-VW-6, R11, R12: everyone booked is told with the invitation and the other times, and books again', async () => {
    const { member, lettingId, applicationId, session } = await aBookedEvening();
    await addViewingSession(member, lettingId, aViewingSession({ date: daysFromToday(10) }));
    expect(await removeViewingSession(member, lettingId, session.id)).toEqual({ told: 1 });
    expect((await sessionsOf(member, lettingId)).map((s) => s.id)).not.toContain(session.id);
    const [application] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(applications).where(eq(applications.id, applicationId)),
    );
    expect(application!.status).toBe('invited');
    const sent = await sentTo(member, applicationId);
    const invitations = sent.filter((m) => m.kind === 'invitation');
    expect(invitations).toHaveLength(2);
    expect(invitations.at(-1)!.templateKey).toBe('invitation@1');
    // Their reminders for the cancelled time never go.
    expect(sent.filter((m) => m.kind === 'reminder' && m.status === 'scheduled')).toEqual([]);
    // The invitation's link books one of the other times.
    const [other] = await sessionsOf(member, lettingId);
    const [slot] = await slotsOf(member, other!.id);
    const token = await tokenInMessage(member, applicationId, 'invitation');
    expect((await bookViewing(token, slot!.id)).ok).toBe(true);
    // Rule 1: no decision about anyone was made; ADR-0006: the event holds a count.
    const made = await withOrg(member.organisationId, (tx) => tx.select().from(decisions));
    expect(made.map((d) => d.kind).sort()).toEqual(['confirm_setup', 'invite_to_view']);
    const [event] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.type, 'viewings.session_removed')),
    );
    expect(event!.data).toEqual({ sessionId: session.id, told: 1 });
  });

  it('UX-VW-6: with people booked and no other time, it says to add one first', async () => {
    const { member, lettingId, session } = await aBookedEvening();
    await expect(removeViewingSession(member, lettingId, session.id)).rejects.toThrow(
      'Add another time first',
    );
  });

  it('UX-VW-6: a time that has started can’t be changed or cancelled', async () => {
    const { member, lettingId, session } = await aBookedEvening();
    await withOrg(member.organisationId, (tx) =>
      tx
        .update(viewingSessions)
        .set({ startsAt: new Date(Date.now() - 60_000) })
        .where(eq(viewingSessions.id, session.id)),
    );
    await expect(removeViewingSession(member, lettingId, session.id)).rejects.toThrow(
      'This viewing has started',
    );
  });
});

describe('UX-VW-6: a viewing time’s sheet', () => {
  it('UX-VW-6: who’s booked and when, places, and the waiting list', async () => {
    const { member, session } = await aBookedEvening();
    const detail = await viewingDetail(member, session.id);
    expect(detail).toMatchObject({
      places: 4,
      booked: 1,
      toMark: 1,
      waiting: 0,
      held: 0,
      otherTimes: 0,
    });
    expect(detail!.people.map((p) => p.name)).toEqual(['Renter 1']);
    const other = await createTestMember();
    expect(await viewingDetail(other, session.id)).toBeNull();
  });
});
