import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import { checks, decisions, events, landlordApprovals, lettings, messages } from '@/db/schema';
import { chooseApplicants } from '@/server/applications/choose';
import { remindAboutCheck, submitReferees } from '@/server/checks/checks';
import { dashboardFor } from '@/server/dashboard/dashboard';
import {
  approvalFor,
  askLandlord,
  recordOwnerApproved,
  remindOwner,
} from '@/server/offers/approval';
import { makeOffer } from '@/server/offers/offer';
import {
  createTestMember,
  peopleWhoApplied,
  shareChecksFor,
  threeComparables,
  tokenInMessage,
} from './helpers';

type Member = Awaited<ReturnType<typeof createTestMember>>;
const terms = { deposit: '€1,850', startDate: '2026-12-01', deadlineHours: '48' };
const DAY = 86_400_000;

async function chosen() {
  const member = await createTestMember();
  const { lettingId, ids } = await peopleWhoApplied(member, [5200, 4800]);
  await chooseApplicants(member, lettingId, { preferredId: ids[0]!, backupId: ids[1]! });
  return { member, lettingId, ids };
}

const sent = (member: Member, lettingId: string, kind: string) =>
  withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(messages)
      .where(and(eq(messages.lettingId, lettingId), eq(messages.kind, kind))),
  );

const offerDecisions = (member: Member) =>
  withOrg(member.organisationId, (tx) =>
    tx.select().from(decisions).where(eq(decisions.kind, 'make_offer')),
  );

/** Every check of the person ends, as if they and their referees had done their part. */
const checksBack = (member: Member, applicationId: string) =>
  withOrg(member.organisationId, (tx) =>
    tx
      .update(checks)
      .set({ status: 'not_needed', completedAt: new Date() })
      .where(eq(checks.applicationId, applicationId)),
  );

describe('UX-DC-15 (Q22): the owner has already approved', () => {
  it('is recorded as today, once, and goes with the offer as the operator’s confirmation', async () => {
    const { member, lettingId, ids } = await chosen();
    await recordOwnerApproved(member, lettingId);
    await recordOwnerApproved(member, lettingId);
    const rows = await withOrg(member.organisationId, (tx) =>
      tx.select().from(landlordApprovals).where(eq(landlordApprovals.lettingId, lettingId)),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'answered',
      preferredId: ids[0],
      backupId: ids[1],
      preferredAnswer: 'approved',
      backupAnswer: 'approved',
      confirmedBy: member.userId,
    });
    // Nothing is sent to the owner, and recording it is not a decision about a renter.
    expect(await sent(member, lettingId, 'landlord_approval')).toHaveLength(0);
    expect(await offerDecisions(member)).toHaveLength(0);
    const [event] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.type, 'landlord.approval_confirmed')),
    );
    expect(event!.data).toEqual({ approvalId: rows[0]!.id, withBackup: true });

    // The offer is the person's decision, and records that they confirmed the owner's approval.
    await threeComparables(member, lettingId);
    expect(
      await makeOffer(member, lettingId, { ...terms, offerBackup: 'yes', withoutChecks: 'yes' }),
    ).toEqual({ ok: true });
    const [decision] = await offerDecisions(member);
    expect(decision!.decidedBy).toBe(member.userId);
    expect(decision!.basis).toMatchObject({
      approvalId: rows[0]!.id,
      landlordConfirmedByOperator: true,
      thenOfferToId: ids[1],
      withoutChecks: true,
      comparables: 3,
    });
  });

  it('turns a request the owner hasn’t answered into the answer, and works with no email', async () => {
    const { member, lettingId } = await chosen();
    await askLandlord(member, lettingId);
    await recordOwnerApproved(member, lettingId);
    expect((await approvalFor(member, lettingId))!.approval).toMatchObject({
      status: 'answered',
      confirmedBy: member.userId,
    });

    const other = await chosen();
    await withOrg(other.member.organisationId, (tx) =>
      tx.update(lettings).set({ landlordId: null }).where(eq(lettings.id, other.lettingId)),
    );
    expect((await approvalFor(other.member, other.lettingId))!.route).toBe('operator_confirms');
    await threeComparables(other.member, other.lettingId);
    await expect(
      makeOffer(other.member, other.lettingId, { ...terms, withoutChecks: 'yes' }),
    ).rejects.toThrow('Ask the owner to approve first.');
    await recordOwnerApproved(other.member, other.lettingId);
    expect(
      await makeOffer(other.member, other.lettingId, { ...terms, withoutChecks: 'yes' }),
    ).toEqual({ ok: true });
  });

  it('is never asked of a landlord letting their own home', async () => {
    const member = await createTestMember({ kind: 'landlord' });
    const { lettingId, ids } = await peopleWhoApplied(member, [5200]);
    await chooseApplicants(member, lettingId, { preferredId: ids[0]!, backupId: '' });
    await expect(recordOwnerApproved(member, lettingId)).rejects.toThrow('your own home');
  });
});

describe('UX-DC-16: while Gaff waits for the owner', () => {
  it('“Remind Mary” sends the same email with a new link, and notes when', async () => {
    const { member, lettingId } = await chosen();
    await expect(remindOwner(member, lettingId)).rejects.toThrow('no answer to wait for');
    await askLandlord(member, lettingId);
    await remindOwner(member, lettingId);
    const emails = await sent(member, lettingId, 'landlord_approval');
    expect(emails).toHaveLength(2);
    expect(emails[0]!.subject).toBe(emails[1]!.subject);
    const link = (body: string) => /\/approve\/([A-Za-z0-9_-]{43})/.exec(body)![1];
    expect(link(emails[0]!.body)).not.toBe(link(emails[1]!.body));
    expect((await approvalFor(member, lettingId))!.approval!.remindedAt).toBeInstanceOf(Date);
    const [event] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.type, 'landlord.approval_reminded')),
    );
    expect(Object.keys(event!.data as object)).toEqual(['approvalId']);
  });
});

describe('UX-DC-13: a check waiting more than three days', () => {
  it('can be reminded: the renter gets the email about their checks again', async () => {
    const { member, lettingId, ids } = await chosen();
    const [identity] = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(checks)
        .where(and(eq(checks.applicationId, ids[0]!), eq(checks.kind, 'identity'))),
    );
    await expect(remindAboutCheck(member, lettingId, identity!.id)).rejects.toThrow(
      'isn’t waiting on anyone',
    );
    expect(
      await remindAboutCheck(member, lettingId, identity!.id, new Date(Date.now() + 4 * DAY)),
    ).toEqual({ to: 'renter' });
    const invitations = (await sent(member, lettingId, 'checks_invitation')).filter(
      (m) => m.applicationId === ids[0],
    );
    expect(invitations).toHaveLength(2);
    const [event] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.type, 'check.reminded')),
    );
    expect(event!.data).toEqual({ checkId: identity!.id, kind: 'identity', to: 'renter' });
  });

  it('or the referee, who gets the reminder now', async () => {
    const { member, lettingId, ids } = await chosen();
    const token = await tokenInMessage(member, ids[0]!, 'checks_invitation');
    await submitReferees(token, {
      landlordName: 'Mary Kelly',
      landlordEmail: 'mary.kelly@example.ie',
      employerNone: 'yes',
    });
    // P39: the referee is asked when the renter shares their checks.
    await shareChecksFor(token);
    const [reference] = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(checks)
        .where(and(eq(checks.applicationId, ids[0]!), eq(checks.kind, 'landlord_reference'))),
    );
    const before = (await sent(member, lettingId, 'reference_reminder')).length;
    expect(
      await remindAboutCheck(member, lettingId, reference!.id, new Date(Date.now() + 4 * DAY)),
    ).toEqual({ to: 'referee' });
    const after = await sent(member, lettingId, 'reference_reminder');
    expect(after).toHaveLength(before + 1);
    expect(after.at(-1)!.toAddress).toBe('mary.kelly@example.ie');
  });
});

describe('UX-DC-19: the offer waits for the rents and the checks', () => {
  it('refuses until three comparable rents are recorded and the checks are back, or the person goes ahead', async () => {
    const { member, lettingId, ids } = await chosen();
    await recordOwnerApproved(member, lettingId);
    await expect(makeOffer(member, lettingId, terms)).rejects.toThrow(
      'Record three comparable rents first.',
    );
    await threeComparables(member, lettingId);
    await expect(makeOffer(member, lettingId, terms)).rejects.toThrow(
      'The checks aren’t all back yet.',
    );
    expect(await offerDecisions(member)).toHaveLength(0);
    await checksBack(member, ids[0]!);
    expect(await makeOffer(member, lettingId, terms)).toEqual({ ok: true });
    const [decision] = await offerDecisions(member);
    expect(decision!.basis).toMatchObject({ withoutChecks: false, depositCents: 185_000 });
  });
});

describe('UX-DC-11: the checks are back, one task on Today', () => {
  it('names the preferred applicant by first name, until the owner is asked; then the offer', async () => {
    const { member, lettingId, ids } = await chosen();
    const kinds = async () =>
      (await dashboardFor(member)).everyone
        .filter((item) => 'lettingId' in item && item.lettingId === lettingId)
        .map((item) => item.kind);
    // While checks run there is nothing to do.
    expect(await kinds()).not.toContain('checks');
    await checksBack(member, ids[0]!);
    const board = await dashboardFor(member);
    expect(board.everyone.find((item) => item.kind === 'checks')).toMatchObject({
      lettingId,
      firstName: 'Renter',
    });
    expect(JSON.stringify(board)).not.toMatch(/@example/);
    // Waiting for the owner: nothing for the person to do.
    await askLandlord(member, lettingId);
    expect(await kinds()).not.toContain('checks');
    expect(await kinds()).not.toContain('offer');
    // The owner's answer arrives on Today: the offer.
    await recordOwnerApproved(member, lettingId);
    expect(await kinds()).toContain('offer');
    expect(await kinds()).not.toContain('checks');
  });
});
