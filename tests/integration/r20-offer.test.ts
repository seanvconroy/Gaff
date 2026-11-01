import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import { applications, decisions, events, lettings, messages, offers } from '@/db/schema';
import { chooseApplicants } from '@/server/applications/choose';
import { dashboardFor } from '@/server/dashboard/dashboard';
import { UserFacingError } from '@/server/errors';
import { closeLetting } from '@/server/lettings/close';
import { answerApproval, askLandlord } from '@/server/offers/approval';
import { expireHomeOffer, makeOffer, respondToOffer } from '@/server/offers/offer';
import { createTestMember, peopleWhoApplied, queuedJobs, tokenInMessage } from './helpers';

type Member = Awaited<ReturnType<typeof createTestMember>>;
const terms = { deposit: '1,850', startDate: '2026-12-01', deadlineHours: '48' };

/** Three applied; the first is preferred, the second the backup; the landlord approves both. */
async function approved(backup: 'approve' | 'decline' = 'approve') {
  const member = await createTestMember();
  const { lettingId, ids } = await peopleWhoApplied(member, [5200, 4800, 6000]);
  await chooseApplicants(member, lettingId, { preferredId: ids[0]!, backupId: ids[1]! });
  await askLandlord(member, lettingId);
  const [ask] = await withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(messages)
      .where(and(eq(messages.lettingId, lettingId), eq(messages.kind, 'landlord_approval'))),
  );
  const token = /\/approve\/([A-Za-z0-9_-]{43})/.exec(ask!.body)![1]!;
  await answerApproval(token, { preferred: 'approve', backup });
  return { member, lettingId, ids };
}

const statusOf = async (member: Member, id: string) =>
  (
    await withOrg(member.organisationId, (tx) =>
      tx.select().from(applications).where(eq(applications.id, id)),
    )
  )[0]!;

const sentTo = (member: Member, id: string, kind: string) =>
  withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(messages)
      .where(and(eq(messages.applicationId, id), eq(messages.kind, kind))),
  );

describe('R20: making the offer', () => {
  it('waits for the landlord, and caps the deposit at one month’s rent', async () => {
    const member = await createTestMember();
    const { lettingId, ids } = await peopleWhoApplied(member, [5200, 4800]);
    await chooseApplicants(member, lettingId, { preferredId: ids[0]!, backupId: '' });
    await expect(makeOffer(member, lettingId, terms)).rejects.toThrow(
      'Ask the landlord to approve first.',
    );
    await askLandlord(member, lettingId);
    await expect(makeOffer(member, lettingId, terms)).rejects.toThrow(
      'Wait for the landlord’s answer first.',
    );
    const { member: m2, lettingId: l2 } = await approved();
    expect(await makeOffer(m2, l2, { ...terms, deposit: '1,851' })).toEqual({
      ok: false,
      errors: { deposit: 'The deposit can’t be more than one month’s rent: €1,850.' },
    });
  });

  it('is a person’s decision; the renter gets the terms and a deadline, and it closes on time', async () => {
    const { member, lettingId, ids } = await approved();
    expect(await makeOffer(member, lettingId, { ...terms, offerBackup: 'yes' })).toEqual({
      ok: true,
    });
    expect((await statusOf(member, ids[0]!)).status).toBe('offered');
    const [email] = await sentTo(member, ids[0]!, 'offer');
    expect(email!.subject).toBe('An offer: 12 Ranelagh Road');
    expect(email!.body).toContain(
      'you’d pay a deposit of €1,850 and the first month’s rent of €1,850',
    );
    const [decision] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(decisions).where(eq(decisions.kind, 'make_offer')),
    );
    expect(decision!.basis).toMatchObject({
      applicationId: ids[0],
      depositCents: 185_000,
      deadlineHours: 48,
      thenOfferToId: ids[1],
      approvalRoute: 'link',
    });
    const [offer] = await withOrg(member.organisationId, (tx) => tx.select().from(offers));
    expect((await queuedJobs('expire_home_offer')).some((j) => j.offerId === offer!.id)).toBe(true);
    const [letting] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(lettings).where(eq(lettings.id, lettingId)),
    );
    expect(letting!.stage).toBe('offer');
    await expect(makeOffer(member, lettingId, terms)).rejects.toThrow(UserFacingError);
  });

  it('a landlord letting their own home approves by making the offer', async () => {
    const member = await createTestMember({ kind: 'landlord' });
    const { lettingId, ids } = await peopleWhoApplied(member, [5200]);
    await chooseApplicants(member, lettingId, { preferredId: ids[0]!, backupId: '' });
    expect(await makeOffer(member, lettingId, terms)).toEqual({ ok: true });
  });
});

describe('R20, Q20: when the offer isn’t accepted', () => {
  it('goes to the backup if a person approved that, on the same terms', async () => {
    const { member, lettingId, ids } = await approved();
    await makeOffer(member, lettingId, { ...terms, offerBackup: 'yes' });
    const token = await tokenInMessage(member, ids[0]!, 'offer');
    expect(await respondToOffer(token, 'decline')).toEqual({ ok: true, accepted: false });
    expect(await statusOf(member, ids[0]!)).toMatchObject({ status: 'declined' });
    expect((await statusOf(member, ids[0]!)).deleteAfter).not.toBeNull();
    expect((await statusOf(member, ids[1]!)).status).toBe('offered');
    const all = await withOrg(member.organisationId, (tx) => tx.select().from(offers));
    const backupOffer = all.find((o) => o.role === 'backup')!;
    expect(backupOffer).toMatchObject({ applicationId: ids[1], depositCents: 185_000 });
    expect(backupOffer.decisionId).toBe(all.find((o) => o.role === 'preferred')!.decisionId);
  });

  it('closes at the deadline, tells the renter, and without a backup asks the operator to choose again', async () => {
    const { member, lettingId, ids } = await approved('decline');
    await makeOffer(member, lettingId, terms);
    const [offer] = await withOrg(member.organisationId, (tx) => tx.select().from(offers));
    await withOrg(member.organisationId, (tx) =>
      tx
        .update(offers)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(offers.id, offer!.id)),
    );
    const token = await tokenInMessage(member, ids[0]!, 'offer');
    expect(await respondToOffer(token, 'accept')).toEqual({ ok: false, reason: 'expired' });
    await expireHomeOffer({ organisationId: member.organisationId, offerId: offer!.id });
    const [closed] = await sentTo(member, ids[0]!, 'offer_expired');
    expect(closed!.subject).toBe('12 Ranelagh Road: the offer has closed');
    expect((await statusOf(member, ids[1]!)).status).toBe('backup');
    expect((await dashboardFor(member)).today).toContainEqual({
      kind: 'rechoose',
      lettingId,
      address: '12 Ranelagh Road',
    });
  });
});

describe('R20, R21: accepted, and everyone else hears', () => {
  it('lets the home, and tells everyone else promptly, with when their details go', async () => {
    const { member, lettingId, ids } = await approved();
    await makeOffer(member, lettingId, { ...terms, offerBackup: 'yes' });
    const token = await tokenInMessage(member, ids[0]!, 'offer');
    expect(await respondToOffer(token, 'accept')).toEqual({ ok: true, accepted: true });
    expect((await statusOf(member, ids[0]!)).status).toBe('accepted');
    const [letting] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(lettings).where(eq(lettings.id, lettingId)),
    );
    expect(letting).toMatchObject({ status: 'let', stage: 'tenancy' });
    for (const id of [ids[1]!, ids[2]!]) {
      const person = await statusOf(member, id);
      expect(person.status).toBe('not_chosen');
      expect(person.deleteAfter).not.toBeNull();
      const [outcome] = await sentTo(member, id, 'outcome');
      expect(outcome!.subject).toBe('12 Ranelagh Road: an update on your application');
      expect(outcome!.body).toContain('has now let the home to another applicant');
    }
    expect(await sentTo(member, ids[0]!, 'outcome')).toEqual([]);
    const [told] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.type, 'outcomes.sent')),
    );
    expect(told!.data).toMatchObject({ told: 2 });
  });
});

describe('R20 with R26: closing a letting closes any open offer', () => {
  it('can’t be accepted once the operator has closed the letting', async () => {
    const { member, lettingId, ids } = await approved();
    await makeOffer(member, lettingId, terms);
    const token = await tokenInMessage(member, ids[0]!, 'offer');
    await closeLetting(member, lettingId, 'withdrawn');
    expect(await respondToOffer(token, 'accept')).toEqual({ ok: false, reason: 'not_open' });
    const [offer] = await withOrg(member.organisationId, (tx) => tx.select().from(offers));
    expect(offer!.status).toBe('expired');
  });
});
