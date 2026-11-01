import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import {
  activityMinutes,
  applications,
  checks,
  decisions,
  events,
  lettings,
  tenancies,
} from '@/db/schema';
import { sealJson } from '@/lib/crypto';
import { recordActiveMinute } from '@/server/dashboard/activity';
import { dashboardFor } from '@/server/dashboard/dashboard';
import { sweepPersonalData } from '@/server/retention/sweep';
import { finishLetting } from '@/server/tenancy/close';
import { confirmPayment, requestPayment, setPaymentAccount } from '@/server/tenancy/payment';
import { givePpsn } from '@/server/tenancy/rtb';
import { markSignedOnPaper } from '@/server/tenancy/tenancy';
import { aLetHome, createTestMember } from './helpers';

type Member = Awaited<ReturnType<typeof createTestMember>>;

async function signedAndPaid() {
  const member = await createTestMember();
  const home = await aLetHome(member);
  await markSignedOnPaper(member, home.lettingId);
  await setPaymentAccount(member, {
    accountName: 'Client account',
    iban: 'IE29AIBK93115212345678',
  });
  await requestPayment(member, home.lettingId, { dueDate: '2026-11-28' });
  return { member, ...home };
}

const read = (member: Member, lettingId: string, tenantId: string) =>
  withOrg(member.organisationId, async (tx) => ({
    letting: (await tx.select().from(lettings).where(eq(lettings.id, lettingId)))[0]!,
    tenancy: (await tx.select().from(tenancies).where(eq(tenancies.lettingId, lettingId)))[0]!,
    tenant: (await tx.select().from(applications).where(eq(applications.id, tenantId)))[0]!,
  }));

describe('R26, stage 9: finishing a let home', () => {
  it('waits for the money, then archives the record and dates the tenant’s details for deletion', async () => {
    const { member, lettingId, tenantId } = await signedAndPaid();
    await expect(finishLetting(member, lettingId)).rejects.toThrow(
      'Finish once the agreement is signed and the payment is in.',
    );
    expect((await dashboardFor(member)).today).toContainEqual({
      kind: 'tenancy',
      lettingId,
      address: '12 Ranelagh Road',
      step: 'confirm_payment',
    });
    await confirmPayment(member, lettingId);
    const { deleteAfter, daysToLet } = await finishLetting(member, lettingId);
    expect(daysToLet).toBe(0);
    const state = await read(member, lettingId, tenantId);
    expect(state.letting).toMatchObject({ stage: 'close', status: 'let' });
    expect(state.tenancy.closedAt).toBeInstanceOf(Date);
    expect(state.tenant.deleteAfter).toBe(deleteAfter);
    const board = await dashboardFor(member);
    expect(board.lettings[0]!.daysToLet).toBe(0);
    expect(board.today.some((i) => i.kind === 'tenancy')).toBe(false);
  });

  it('deletes the tenant’s details on that date, signature and PPS number included', async () => {
    const { member, lettingId, tenantId, tenantToken } = await signedAndPaid();
    await givePpsn(tenantToken, { ppsn: '1234567T' });
    await confirmPayment(member, lettingId);
    const { deleteAfter } = await finishLetting(member, lettingId);
    await sweepPersonalData(new Date(`${deleteAfter}T12:00:00Z`), member.organisationId);
    const state = await read(member, lettingId, tenantId);
    expect(state.tenant).toMatchObject({ fullName: 'Deleted', phone: null });
    expect(state.tenancy).toMatchObject({ tenantSignedName: null, ppsnSealed: null });
  });
});

describe('R26: references, once the tenancy starts', () => {
  it('deletes the tenant’s reference answers and referees’ details', async () => {
    const { member, lettingId, tenantId } = await signedAndPaid();
    await withOrg(member.organisationId, (tx) =>
      tx
        .update(checks)
        .set({
          status: 'answered',
          refereeName: 'Mary Kelly',
          refereeEmail: 'mary.kelly@example.ie',
          resultSealed: sealJson({ rentedFromYou: 'yes' }),
        })
        .where(and(eq(checks.applicationId, tenantId), eq(checks.kind, 'landlord_reference'))),
    );
    // Before the start date, they stay.
    await sweepPersonalData(new Date('2026-11-20T12:00:00Z'), member.organisationId);
    let [reference] = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(checks)
        .where(and(eq(checks.applicationId, tenantId), eq(checks.kind, 'landlord_reference'))),
    );
    expect(reference!.refereeEmail).toBe('mary.kelly@example.ie');
    // From the start date (1 December), they go.
    await sweepPersonalData(new Date('2026-12-01T12:00:00Z'), member.organisationId);
    [reference] = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(checks)
        .where(and(eq(checks.applicationId, tenantId), eq(checks.kind, 'landlord_reference'))),
    );
    expect(reference).toMatchObject({
      status: 'answered',
      refereeName: null,
      refereeEmail: null,
      resultSealed: null,
    });
    const logged = await withOrg(member.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.type, 'tenancy.references_deleted')),
    );
    expect(logged).toHaveLength(1);
    expect(lettingId).toBeTruthy();
  });
});

describe('R26 (Q3): the anonymous record after 12 months', () => {
  it('deletes events, decisions and active minutes older than the record period', async () => {
    const { member, lettingId } = await signedAndPaid();
    await recordActiveMinute(member, lettingId);
    const count = async () =>
      withOrg(member.organisationId, async (tx) => ({
        events: (await tx.select().from(events)).length,
        decisions: (await tx.select().from(decisions)).length,
        minutes: (await tx.select().from(activityMinutes)).length,
      }));
    const before = await count();
    expect(before.events).toBeGreaterThan(10);
    expect(before.decisions).toBeGreaterThan(2);
    await sweepPersonalData(new Date(Date.now() + 300 * 86_400_000), member.organisationId);
    expect((await count()).events).toBeGreaterThanOrEqual(before.events);
    const swept = await sweepPersonalData(
      new Date(Date.now() + 400 * 86_400_000),
      member.organisationId,
    );
    expect(swept.recordEvents).toBeGreaterThanOrEqual(before.events);
    const after = await count();
    expect(after.decisions).toBe(0);
    expect(after.minutes).toBe(0);
    // Only the sweep's own new log entries remain: deletions it just recorded.
    const left = await withOrg(member.organisationId, (tx) => tx.select().from(events));
    expect(left.every((e) => e.actorType === 'system')).toBe(true);
  });
});
