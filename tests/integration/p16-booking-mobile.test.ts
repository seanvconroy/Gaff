import { and, asc, desc, eq, like } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg } from '@/db/client';
import { applications, devOutbox, events, messages, viewingSlots } from '@/db/schema';
import { inviteToView } from '@/server/shortlist/invite';
import { bookViewing } from '@/server/viewings/booking';
import { confirmBookingCode, sendBookingCode } from '@/server/viewings/mobile';
import {
  aLiveLetting,
  aRenterEnquires,
  confirmBookingMobile,
  createTestMember,
  tokenInMessage,
} from './helpers';

/** A live letting with two people invited to view. */
async function setUp() {
  const member = await createTestMember();
  const { lettingId } = await aLiveLetting(member);
  const ids = [
    await aRenterEnquires(member, 1, { occupants: '1', hasPets: 'no' }),
    await aRenterEnquires(member, 2, { occupants: '1', hasPets: 'no' }),
    await aRenterEnquires(member, 3, { occupants: '1', hasPets: 'no' }),
  ];
  await inviteToView(member, lettingId, { chosenIds: [ids[0]!, ids[1]!], waitlistSize: 0 });
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

const aMobile = () => `087${String(Math.random()).slice(2, 9)}`;
const e164 = (mobile: string) => `+353${mobile.slice(1)}`;

async function lastCode(mobile: string): Promise<string> {
  const [sms] = await db()
    .select({ text: devOutbox.text })
    .from(devOutbox)
    .where(and(eq(devOutbox.toAddress, e164(mobile)), like(devOutbox.text, '%Gaff code%')))
    .orderBy(desc(devOutbox.createdAt))
    .limit(1);
  return /(\d{6})/.exec(sms!.text)![1]!;
}

async function applicationRow(
  member: Awaited<ReturnType<typeof createTestMember>>,
  applicationId: string,
) {
  const [row] = await withOrg(member.organisationId, (tx) =>
    tx.select().from(applications).where(eq(applications.id, applicationId)),
  );
  return row!;
}

describe('P16: a confirmed mobile to book a viewing', () => {
  it('P16: texts a code keyed to the application, and the confirmed number gets the reminder', async () => {
    const { member, ids, slots, token } = await setUp();
    const t = await token(0);
    const mobile = aMobile();
    const sent = await sendBookingCode(t, mobile);
    expect(sent).toMatchObject({ ok: true, masked: `087 ••• ${mobile.slice(-4)}` });
    // The code is stored only as a hash, and the number isn't the application's until confirmed.
    const pending = await applicationRow(member, ids[0]!);
    expect(pending.mobileCodeHash).not.toContain(await lastCode(mobile));
    expect(pending.mobileConfirmedAt).toBeNull();

    expect(await confirmBookingCode(t, await lastCode(mobile))).toEqual({ ok: true });
    const confirmed = await applicationRow(member, ids[0]!);
    expect(confirmed).toMatchObject({
      phoneE164: e164(mobile),
      smsReminders: true,
      mobilePending: null,
      mobileCodeHash: null,
      mobileCodeExpiresAt: null,
    });
    expect(confirmed.mobileConfirmedAt).toBeInstanceOf(Date);

    expect((await bookViewing(t, slots[0]!.id)).ok).toBe(true);
    const sms = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(messages)
        .where(and(eq(messages.applicationId, ids[0]!), eq(messages.channel, 'sms'))),
    );
    expect(sms.map((m) => m.toAddress)).toEqual([e164(mobile)]);

    const logged = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ type: events.type, data: events.data })
        .from(events)
        .where(eq(events.subjectId, ids[0]!)),
    );
    expect(logged.map((e) => e.type)).toEqual(
      expect.arrayContaining(['booking.mobile_code_sent', 'booking.mobile_confirmed']),
    );
    for (const event of logged) expect(JSON.stringify(event.data)).not.toContain(mobile.slice(3));
  });

  it('P16, Q60: a new booking needs a confirmed mobile; moving it doesn’t ask again', async () => {
    const { slots, token } = await setUp();
    const t = await token(0);
    expect(await bookViewing(t, slots[0]!.id)).toEqual({ ok: false, reason: 'mobile_needed' });
    await confirmBookingMobile(t);
    expect(await bookViewing(t, slots[0]!.id)).toEqual({ ok: true, rescheduled: false });
    expect(await bookViewing(t, slots[1]!.id)).toEqual({ ok: true, rescheduled: true });
  });

  it('P16, Q12: a number given when enquiring isn’t enough to book, and gets no reminder', async () => {
    const { member, ids, slots, token } = await setUp();
    await withOrg(member.organisationId, (tx) =>
      tx
        .update(applications)
        .set({ phoneE164: '+353871112223', smsReminders: false })
        .where(eq(applications.id, ids[1]!)),
    );
    const t = await token(1);
    expect(await bookViewing(t, slots[1]!.id)).toEqual({ ok: false, reason: 'mobile_needed' });
    const confirmed = await confirmBookingMobile(t);
    expect((await bookViewing(t, slots[1]!.id)).ok).toBe(true);
    const sms = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(messages)
        .where(and(eq(messages.applicationId, ids[1]!), eq(messages.channel, 'sms'))),
    );
    expect(sms.map((m) => m.toAddress)).toEqual([confirmed]);
  });

  it('P16: a wrong code counts, five lock it, and an expired one is refused', async () => {
    const { token } = await setUp();
    const t = await token(0);
    const mobile = aMobile();
    await sendBookingCode(t, mobile);
    const code = await lastCode(mobile);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) {
      expect(await confirmBookingCode(t, wrong)).toEqual({ ok: false, problem: 'wrong' });
    }
    expect(await confirmBookingCode(t, code)).toEqual({ ok: false, problem: 'locked' });

    const later = new Date(Date.now() + 60_000);
    expect((await sendBookingCode(t, mobile, later)).ok).toBe(true);
    const fresh = await lastCode(mobile);
    expect(await confirmBookingCode(t, fresh, new Date(later.getTime() + 11 * 60_000))).toEqual({
      ok: false,
      problem: 'expired',
    });
  });

  it('P16: limits texts, refuses what isn’t a mobile, and only for someone invited', async () => {
    const { member, ids, token } = await setUp();
    const t = await token(0);
    expect(await sendBookingCode(t, '01 234 5678')).toEqual({ ok: false, problem: 'invalid' });
    expect((await sendBookingCode(t, aMobile())).ok).toBe(true);
    expect(await sendBookingCode(t, aMobile())).toEqual({ ok: false, problem: 'too_soon' });
    // Someone who enquired but wasn't invited can't ask for a code from their link.
    const notInvited = await tokenInMessage(member, ids[2]!, 'first_reply');
    expect(await sendBookingCode(notInvited, aMobile())).toEqual({ ok: false, problem: 'link' });
    expect(await confirmBookingCode('not-a-token', '123456')).toEqual({
      ok: false,
      problem: 'link',
    });
  });
});
