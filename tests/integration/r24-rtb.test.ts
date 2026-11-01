import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg } from '@/db/client';
import { devOutbox, events, tenancies } from '@/db/schema';
import { dashboardFor } from '@/server/dashboard/dashboard';
import {
  givePpsn,
  markRtbRegistered,
  rentSettingPack,
  rtbPack,
  sendRtbReminder,
} from '@/server/tenancy/rtb';
import { aLetHome, createTestMember, queuedJobs } from './helpers';

type Member = Awaited<ReturnType<typeof createTestMember>>;
const tenancyOf = async (member: Member, lettingId: string) =>
  (
    await withOrg(member.organisationId, (tx) =>
      tx.select().from(tenancies).where(eq(tenancies.lettingId, lettingId)),
    )
  )[0]!;

describe('R24 (Q24): the PPS number, optional and for the RTB only', () => {
  it('is checked, sealed, shown only in the RTB pack, and logged without the number', async () => {
    const member = await createTestMember();
    const { lettingId, tenantToken } = await aLetHome(member);
    expect(await givePpsn(tenantToken, { ppsn: '1234567A' })).toEqual({
      ok: false,
      errors: { ppsn: 'That PPS number doesn’t look right. Check it, or leave it blank.' },
    });
    expect(await givePpsn(tenantToken, { ppsn: '1234567t' })).toEqual({ ok: true });
    const stored = await tenancyOf(member, lettingId);
    expect(stored.ppsnSealed).toMatch(/^v1:/);
    expect(stored.ppsnSealed).not.toContain('1234567');
    const pack = await rtbPack(member, lettingId);
    expect(pack).toMatchObject({ ppsn: '1234567T', deadline: '2027-01-01' });
    expect(Object.keys(pack!.tenant)).not.toContain('dateOfBirth');
    const [logged] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.type, 'tenancy.ppsn_given')),
    );
    expect(logged!.data).toEqual({ tenancyId: stored.id, given: true });
  });

  it('is deleted once the tenancy is registered, and can’t be given after', async () => {
    const member = await createTestMember();
    const { lettingId, tenantToken } = await aLetHome(member);
    await givePpsn(tenantToken, { ppsn: '1234567T' });
    await markRtbRegistered(member, lettingId, { reference: 'RT0012345' });
    const registered = await tenancyOf(member, lettingId);
    expect(registered).toMatchObject({ ppsnSealed: null, rtbReference: 'RT0012345' });
    expect(registered.rtbRegisteredAt).toBeInstanceOf(Date);
    expect(await givePpsn(tenantToken, { ppsn: '1234567T' })).toBeNull();
  });
});

describe('R24: the packs, and the reminder to register', () => {
  it('has the rent-setting pack: the check and the comparables', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLetHome(member);
    const pack = await rentSettingPack(member, lettingId);
    expect(pack!.check).toMatchObject({ result: 'market', rulesVersion: 'ie-2026-03-v1' });
    expect(pack!.tenancy!.rentCents).toBe(185_000);
  });

  it('reminds the admins before the deadline, unless it’s registered; and shows on the dashboard once started', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLetHome(member);
    const tenancy = await tenancyOf(member, lettingId);
    expect((await queuedJobs('rtb_reminder')).some((j) => j.tenancyId === tenancy.id)).toBe(true);
    await sendRtbReminder({ organisationId: member.organisationId, tenancyId: tenancy.id });
    const sent = await db()
      .select()
      .from(devOutbox)
      .where(and(eq(devOutbox.toAddress, member.email)));
    expect(
      sent.some(
        (m) => m.subject === 'Register 12 Ranelagh Road with the RTB by Friday 1 January 2027',
      ),
    ).toBe(true);

    await withOrg(member.organisationId, (tx) =>
      tx.update(tenancies).set({ startDate: '2026-10-01' }).where(eq(tenancies.id, tenancy.id)),
    );
    expect((await dashboardFor(member)).today).toContainEqual({
      kind: 'rtb',
      lettingId,
      address: '12 Ranelagh Road',
      dueBy: '2026-11-01',
    });
    await markRtbRegistered(member, lettingId, { reference: '' });
    expect((await dashboardFor(member)).today.some((i) => i.kind === 'rtb')).toBe(false);
  });
});
