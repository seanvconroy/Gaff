import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import { applications, decisions, events, lettings } from '@/db/schema';
import { applicantsFor, chooseApplicants } from '@/server/applications/choose';
import { dashboardFor } from '@/server/dashboard/dashboard';
import { UserFacingError } from '@/server/errors';
import { createTestMember, peopleWhoApplied } from './helpers';

// Rent is €1,850; the default rule asks for 2.5 times: €4,625 take-home.
const statuses = async (member: Awaited<ReturnType<typeof createTestMember>>, ids: string[]) =>
  withOrg(member.organisationId, async (tx) => {
    const rows = await tx.select().from(applications);
    return ids.map((id) => rows.find((r) => r.id === id)!.status);
  });

describe('R17: applicants side by side', () => {
  it('shows everyone who applied, in shortlist order, against the income rule', async () => {
    const member = await createTestMember();
    const { lettingId, ids } = await peopleWhoApplied(member, [5200, 4000]);
    const listing = await applicantsFor(member, lettingId);
    expect(listing!.rows.map((r) => [r.id, r.position, r.ratioTenths, r.meetsRule])).toEqual([
      [ids[0], 1, 28, true],
      [ids[1], 2, 21, false],
    ]);
    const board = await dashboardFor(member);
    expect(board.today).toContainEqual({
      kind: 'choose',
      lettingId,
      address: '12 Ranelagh Road',
      count: 2,
    });
  });
});

describe('R17: a person chooses the preferred applicant and the backup', () => {
  it('records the decision with what they saw, as IDs and numbers only', async () => {
    const member = await createTestMember();
    const { lettingId, ids } = await peopleWhoApplied(member, [5200, 4000, 6000]);
    await chooseApplicants(member, lettingId, { preferredId: ids[1]!, backupId: ids[0]! });
    expect(await statuses(member, ids)).toEqual(['backup', 'preferred', 'applied']);
    const [decision] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(decisions).where(eq(decisions.kind, 'choose_applicants')),
    );
    expect(decision!.basis).toMatchObject({ preferredId: ids[1], backupId: ids[0] });
    const basis = JSON.stringify(decision!.basis);
    expect(basis).not.toMatch(/Renter|@|5200|520000/);
    const [letting] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(lettings).where(eq(lettings.id, lettingId)),
    );
    expect(letting!.stage).toBe('checks');
    const logged = await withOrg(member.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.type, 'applicants.chosen')),
    );
    expect(logged[0]!.data).toEqual({ decisionId: decision!.id, applied: 3, withBackup: true });
    expect((await dashboardFor(member)).today).toEqual([]);
  });

  it('can be changed before an offer, and only from people who applied', async () => {
    const member = await createTestMember();
    const { lettingId, ids } = await peopleWhoApplied(member, [5200, 4000, 6000]);
    await chooseApplicants(member, lettingId, { preferredId: ids[0]!, backupId: ids[1]! });
    await chooseApplicants(member, lettingId, { preferredId: ids[2]!, backupId: '' });
    expect(await statuses(member, ids)).toEqual(['applied', 'applied', 'preferred']);
    await expect(
      chooseApplicants(member, lettingId, { preferredId: ids[0]!, backupId: ids[0]! }),
    ).rejects.toThrow('Your backup needs to be someone other than your preferred applicant.');
    await expect(
      chooseApplicants(member, lettingId, { preferredId: crypto.randomUUID(), backupId: '' }),
    ).rejects.toThrow(UserFacingError);
  });
});
