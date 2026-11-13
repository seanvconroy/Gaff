import { and, asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import { applications, events, messages, viewingSlots } from '@/db/schema';
import { submitApplication } from '@/server/applications/apply';
import { UserFacingError } from '@/server/errors';
import { setIncomeRule } from '@/server/organisations/income-rule';
import { inviteToView } from '@/server/shortlist/invite';
import { markAttendance } from '@/server/viewings/attendance';
import { aLiveLetting, aRenterEnquires, bookAs, createTestMember, tokenInMessage } from './helpers';

/** A renter who booked the first slot, which started five minutes ago. */
async function aViewingUnderWay() {
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
  await bookAs(token, slot!.id);
  const endsAt = new Date(Date.now() + 10 * 60_000);
  await withOrg(member.organisationId, (tx) =>
    tx
      .update(viewingSlots)
      .set({ startsAt: new Date(Date.now() - 5 * 60_000), endsAt })
      .where(eq(viewingSlots.id, slot!.id)),
  );
  const [booking] = await withOrg(member.organisationId, async (tx) =>
    tx.query.bookings.findMany({ where: (b, { eq: e }) => e(b.applicationId, applicationId) }),
  );
  return { member, lettingId, applicationId, token, endsAt, bookingId: booking!.id };
}

const applyInvites = (member: Awaited<ReturnType<typeof createTestMember>>, id: string) =>
  withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(messages)
      .where(and(eq(messages.applicationId, id), eq(messages.kind, 'apply_invitation'))),
  );

describe('R16: people who came are invited to apply after their viewing', () => {
  it('queues the invitation for the end of their viewing, once', async () => {
    const { member, lettingId, applicationId, endsAt, bookingId } = await aViewingUnderWay();
    await markAttendance(member, { lettingId, bookingId, attended: true });
    await markAttendance(member, { lettingId, bookingId, attended: false });
    await markAttendance(member, { lettingId, bookingId, attended: true });
    const invites = await applyInvites(member, applicationId);
    expect(invites.map((m) => m.status).sort()).toEqual(['cancelled', 'scheduled']);
    const live = invites.find((m) => m.status === 'scheduled')!;
    expect(live.sendAt?.getTime()).toBe(endsAt.getTime());
    expect(live.subject).toBe('Apply for 12 Ranelagh Road');
    expect(live.body).toMatch(/you don’t need any documents/);
  });

  it('doesn’t invite someone marked as not having come', async () => {
    const { member, lettingId, applicationId, bookingId } = await aViewingUnderWay();
    await markAttendance(member, { lettingId, bookingId, attended: false });
    expect(await applyInvites(member, applicationId)).toEqual([]);
  });
});

describe('R16: applying (stage 5 data, and only then)', () => {
  it('can’t apply before coming to view', async () => {
    const { token } = await aViewingUnderWay();
    expect(await submitApplication(token, { earning: 'employed', monthlyIncome: '4000' })).toEqual({
      ok: false,
      closed: true,
    });
  });

  it('stores only how they earn and their take-home income, and logs it by ID', async () => {
    const { member, lettingId, applicationId, token, bookingId } = await aViewingUnderWay();
    await markAttendance(member, { lettingId, bookingId, attended: true });
    expect(await submitApplication(token, { earning: 'employed', monthlyIncome: 'lots' })).toEqual({
      ok: false,
      errors: { monthlyIncome: 'Enter your take-home income as an amount, like 3,200.' },
    });
    expect(await submitApplication(token, { earning: 'employed', monthlyIncome: '4,800' })).toEqual(
      { ok: true },
    );
    expect(
      await submitApplication(token, { earning: 'self_employed', monthlyIncome: '5100' }),
    ).toEqual({ ok: true });
    const [person] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(applications).where(eq(applications.id, applicationId)),
    );
    expect(person).toMatchObject({
      status: 'applied',
      earning: 'self_employed',
      monthlyIncomeCents: 510_000,
    });
    const logged = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(events)
        .where(eq(events.type, 'application.submitted'))
        .orderBy(asc(events.id)),
    );
    expect(logged.map((e) => e.data)).toEqual([
      { applicationId, changed: false },
      { applicationId, changed: true },
    ]);
  });
});

describe('R16, R17: the income rule', () => {
  it('is set by an admin, from the fixed choices', async () => {
    const member = await createTestMember();
    await expect(setIncomeRule({ ...member, role: 'negotiator' }, 30)).rejects.toThrow(
      UserFacingError,
    );
    await expect(setIncomeRule(member, 99)).rejects.toThrow('Choose one of the income rules.');
    await setIncomeRule(member, 30);
    const logged = await withOrg(member.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.type, 'settings.income_rule')),
    );
    expect(logged[0]?.data).toEqual({ ruleTenths: 30 });
  });
});
