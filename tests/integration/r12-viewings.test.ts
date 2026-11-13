import { and, asc, desc, eq, like } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg } from '@/db/client';
import {
  applications,
  bookings,
  devOutbox,
  messages,
  viewingSlots,
  waitlistOffers,
} from '@/db/schema';
import { sendMessage } from '@/server/messages/outbox';
import { inviteToView } from '@/server/shortlist/invite';
import { bookViewing, cancelViewing, slotAvailability } from '@/server/viewings/booking';
import { confirmBookingCode, sendBookingCode } from '@/server/viewings/mobile';
import { expireOffer, offerFreedPlace } from '@/server/viewings/waitlist';
import {
  aLiveLetting,
  aRenterEnquires,
  bookAs,
  createTestMember,
  queuedJobs,
  tokenInMessage,
} from './helpers';

/** A live letting with 4 one-person slots: 2 invited, 2 on the waiting list. */
async function setUp() {
  const member = await createTestMember();
  const { lettingId } = await aLiveLetting(member);
  const ids: string[] = [];
  for (const n of [1, 2, 3, 4]) {
    ids.push(await aRenterEnquires(member, n, { occupants: '1', hasPets: 'no' }));
  }
  await inviteToView(member, lettingId, { chosenIds: [ids[0]!, ids[1]!], waitlistSize: 2 });
  const slots = await withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(viewingSlots)
      .where(eq(viewingSlots.lettingId, lettingId))
      .orderBy(asc(viewingSlots.startsAt)),
  );
  const token = (i: number) => tokenInMessage(member, ids[i]!, 'invitation');
  return { member, lettingId, ids, slots, token };
}

/** P16: the renter confirms their mobile with the texted code before booking. */
async function confirmMobile(token: string, mobile: string) {
  expect((await sendBookingCode(token, mobile)).ok).toBe(true);
  const [sms] = await db()
    .select({ text: devOutbox.text })
    .from(devOutbox)
    .where(
      and(
        eq(devOutbox.toAddress, `+353${mobile.replace(/\s/g, '').slice(1)}`),
        like(devOutbox.text, '%Gaff code%'),
      ),
    )
    .orderBy(desc(devOutbox.createdAt))
    .limit(1);
  expect(await confirmBookingCode(token, /(\d{6})/.exec(sms!.text)![1]!)).toEqual({ ok: true });
}

async function messagesFor(
  member: Awaited<ReturnType<typeof createTestMember>>,
  applicationId: string,
) {
  return withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(messages)
      .where(and(eq(messages.applicationId, applicationId), eq(messages.direction, 'outbound'))),
  );
}

describe('R12 and R13: booking, with confirmation and reminders', () => {
  it('books a slot, confirms it, and schedules reminders (SMS too, with a confirmed mobile)', async () => {
    const { member, ids, slots, token } = await setUp();
    const t = await token(0);
    await confirmMobile(t, '086 765 4321');
    expect(await bookViewing(t, slots[0]!.id)).toEqual({
      ok: true,
      rescheduled: false,
    });
    const [application] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(applications).where(eq(applications.id, ids[0]!)),
    );
    expect(application).toMatchObject({ status: 'booked', phoneE164: '+353867654321' });
    const sent = await messagesFor(member, ids[0]!);
    const booking = sent.filter((m) => m.bookingId);
    expect(booking.map((m) => [m.kind, m.channel]).sort()).toEqual([
      ['booking_confirmation', 'email'],
      ['reminder', 'email'],
      ['reminder', 'email'],
      ['reminder', 'sms'],
    ]);
    const sms = booking.find((m) => m.channel === 'sms')!;
    expect(sms.sendAt?.getTime()).toBe(slots[0]!.startsAt.getTime() - 2 * 3_600_000);
    expect(sms.toAddress).toBe('+353867654321');
  });

  it('never double-books a one-person slot', async () => {
    const { slots, token } = await setUp();
    expect((await bookAs(await token(0), slots[0]!.id)).ok).toBe(true);
    expect(await bookAs(await token(1), slots[0]!.id)).toEqual({ ok: false, reason: 'full' });
  });

  it('moves a booking, cancelling the old reminders', async () => {
    const { member, ids, slots, token } = await setUp();
    const t = await token(0);
    await bookAs(t, slots[0]!.id);
    expect(await bookViewing(t, slots[1]!.id)).toEqual({ ok: true, rescheduled: true });
    const all = await withOrg(member.organisationId, (tx) =>
      tx.select().from(bookings).where(eq(bookings.applicationId, ids[0]!)),
    );
    expect(all.map((b) => [b.slotId, b.status]).sort()).toEqual(
      [
        [slots[0]!.id, 'cancelled'],
        [slots[1]!.id, 'booked'],
      ].sort(),
    );
    const reminders = (await messagesFor(member, ids[0]!)).filter((m) => m.kind === 'reminder');
    // Two emails and, with the confirmed mobile, a text, for each booking.
    expect(reminders.filter((m) => m.status === 'cancelled')).toHaveLength(3);
    expect(reminders.filter((m) => m.status === 'scheduled')).toHaveLength(3);
  });

  it('refuses someone who wasn’t invited', async () => {
    const { ids, member, slots } = await setUp();
    const waitlistedToken = await tokenInMessage(member, ids[2]!, 'first_reply');
    expect(await bookViewing(waitlistedToken, slots[0]!.id)).toEqual({
      ok: false,
      reason: 'not_invited',
    });
  });

  it('sends SMS through the SMS adapter (development outbox locally)', async () => {
    const { member, ids, slots, token } = await setUp();
    const t = await token(0);
    await confirmMobile(t, '086 765 4321');
    await bookViewing(t, slots[0]!.id);
    const sms = (await messagesFor(member, ids[0]!)).find((m) => m.channel === 'sms')!;
    await withOrg(member.organisationId, (tx) =>
      tx.update(messages).set({ sendAt: new Date() }).where(eq(messages.id, sms.id)),
    );
    expect(
      await sendMessage({
        organisationId: member.organisationId,
        messageId: sms.id,
        attempt: 1,
        maxAttempts: 10,
      }),
    ).toBe('sent');
    const [stored] = await db()
      .select()
      .from(devOutbox)
      .where(
        and(
          eq(devOutbox.toAddress, '+353867654321'),
          eq(devOutbox.fromAddress, 'SMS'),
          like(devOutbox.text, '%reminder%'),
        ),
      );
    expect(stored?.text).toMatch(/reminder, you're viewing 12 Ranelagh Road today at \d/);
  });
});

/** A booked renter cancels, and the worker runs the queued offer job. */
async function cancelAndOffer(
  member: Awaited<ReturnType<typeof createTestMember>>,
  token: string,
  slotId: string,
) {
  expect(await cancelViewing(token)).toEqual({ ok: true });
  expect((await queuedJobs('offer_place')).some((j) => j.slotId === slotId)).toBe(true);
  await offerFreedPlace(member.organisationId, slotId);
}

async function offersFor(member: Awaited<ReturnType<typeof createTestMember>>) {
  return withOrg(member.organisationId, (tx) =>
    tx.select().from(waitlistOffers).orderBy(asc(waitlistOffers.offeredAt)),
  );
}

describe('R14: a cancelled place goes to the approved waiting list (Q2)', () => {
  it('offers it to the next person in ranked order, with a 2-hour hold', async () => {
    const { member, ids, slots, token } = await setUp();
    const t = await token(0);
    await bookAs(t, slots[0]!.id);
    await cancelAndOffer(member, t, slots[0]!.id);

    const offers = await offersFor(member);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      applicationId: ids[2],
      mode: 'one_at_a_time',
      status: 'open',
    });
    expect((await messagesFor(member, ids[2]!)).some((m) => m.kind === 'place_offered')).toBe(true);
    expect((await queuedJobs('expire_offer')).some((j) => j.offerId === offers[0]!.id)).toBe(true);

    // The renter who cancelled is still invited, so they can book another time.
    const [first] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(applications).where(eq(applications.id, ids[0]!)),
    );
    expect(first?.status).toBe('invited');
  });

  it('lets the person offered book that place, and only that place', async () => {
    const { member, ids, slots, token } = await setUp();
    const t = await token(0);
    await bookAs(t, slots[0]!.id);
    await cancelAndOffer(member, t, slots[0]!.id);
    const offeredToken = await tokenInMessage(member, ids[2]!, 'place_offered');
    expect(await bookAs(offeredToken, slots[1]!.id)).toEqual({
      ok: false,
      reason: 'not_invited',
    });
    expect(await bookViewing(offeredToken, slots[0]!.id)).toEqual({ ok: true, rescheduled: false });
    const [offer] = await offersFor(member);
    expect(offer?.status).toBe('taken');
  });

  it('keeps a held place for the person it was offered to', async () => {
    const { member, ids, slots, token } = await setUp();
    const t = await token(0);
    await bookAs(t, slots[0]!.id);
    await cancelAndOffer(member, t, slots[0]!.id);
    // Someone invited who hasn't booked yet can't take the place held for the waiting list.
    expect(await bookAs(await token(1), slots[0]!.id)).toEqual({ ok: false, reason: 'full' });
    const view = (applicationId: string) =>
      withOrg(member.organisationId, (tx) =>
        slotAvailability(tx, slots[0]!.lettingId, applicationId),
      );
    expect((await view(ids[1]!)).find((s) => s.id === slots[0]!.id)?.booked).toBe(1);
    expect((await view(ids[2]!)).find((s) => s.id === slots[0]!.id)?.booked).toBe(0);
  });

  it('offers two freed places to two different people', async () => {
    const { member, ids, slots, token } = await setUp();
    const [a, b] = [await token(0), await token(1)];
    await bookAs(a, slots[0]!.id);
    await bookAs(b, slots[1]!.id);
    await cancelAndOffer(member, a, slots[0]!.id);
    await cancelAndOffer(member, b, slots[1]!.id);
    const offers = await offersFor(member);
    expect(offers.map((o) => [o.slotId, o.applicationId])).toEqual([
      [slots[0]!.id, ids[2]],
      [slots[1]!.id, ids[3]],
    ]);
  });

  it('puts someone from the waiting list back on it if they cancel', async () => {
    const { member, ids, slots, token } = await setUp();
    const t = await token(0);
    await bookAs(t, slots[0]!.id);
    await cancelAndOffer(member, t, slots[0]!.id);
    const offeredToken = await tokenInMessage(member, ids[2]!, 'place_offered');
    await bookAs(offeredToken, slots[0]!.id);
    expect(await cancelViewing(offeredToken)).toEqual({ ok: true });
    const [renter] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(applications).where(eq(applications.id, ids[2]!)),
    );
    expect(renter).toMatchObject({ status: 'waitlisted', waitlistPosition: 1 });
  });

  it('moves on to the next person when a hold runs out', async () => {
    const { member, ids, slots, token } = await setUp();
    const t = await token(0);
    await bookAs(t, slots[0]!.id);
    await cancelAndOffer(member, t, slots[0]!.id);
    const [first] = await offersFor(member);
    await expireOffer({ organisationId: member.organisationId, offerId: first!.id });
    const offers = await offersFor(member);
    expect(offers.map((o) => [o.applicationId, o.status])).toEqual([
      [ids[2], 'expired'],
      [ids[3], 'open'],
    ]);
  });
});
