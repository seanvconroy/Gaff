import { and, desc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg } from '@/db/client';
import { devOutbox, events, landlordApprovals, lettings, messages } from '@/db/schema';
import { sendMessage } from '@/server/messages/outbox';
import { chooseApplicants } from '@/server/applications/choose';
import {
  answerApproval,
  approvalFor,
  askLandlord,
  loadApprovalSummary,
  saveLandlordContact,
} from '@/server/offers/approval';
import { createTestMember, peopleWhoApplied } from './helpers';

type Member = Awaited<ReturnType<typeof createTestMember>>;

async function chosenWithLandlord() {
  const member = await createTestMember();
  const { lettingId, ids } = await peopleWhoApplied(member, [5200, 4800, 6000]);
  await chooseApplicants(member, lettingId, { preferredId: ids[0]!, backupId: ids[1]! });
  return { member, lettingId, ids };
}

async function approvalLink(member: Member, lettingId: string) {
  const [sent] = await withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(messages)
      .where(and(eq(messages.lettingId, lettingId), eq(messages.kind, 'landlord_approval'))),
  );
  return { message: sent!, token: /\/approve\/([A-Za-z0-9_-]{43})/.exec(sent!.body)![1]! };
}

describe('R19: who approves (Q22)', () => {
  it('a landlord letting their own homes approves by making the offer', async () => {
    const member = await createTestMember({ kind: 'landlord' });
    const { lettingId, ids } = await peopleWhoApplied(member, [5200]);
    await chooseApplicants(member, lettingId, { preferredId: ids[0]!, backupId: '' });
    expect((await approvalFor(member, lettingId))!.route).toBe('own_home');
  });

  it('an agency without the landlord’s email can add it, and then send the link', async () => {
    const { member, lettingId } = await chosenWithLandlord();
    await withOrg(member.organisationId, (tx) =>
      tx.update(lettings).set({ landlordId: null }).where(eq(lettings.id, lettingId)),
    );
    expect((await approvalFor(member, lettingId))!.route).toBe('operator_confirms');
    await expect(askLandlord(member, lettingId)).rejects.toThrow('Add the landlord’s email first.');
    await saveLandlordContact(member, lettingId, { name: 'Tom Walsh', email: 'TOM@example.ie' });
    const state = await approvalFor(member, lettingId);
    expect(state).toMatchObject({
      route: 'link',
      landlord: { name: 'Tom Walsh', email: 'tom@example.ie' },
    });
  });
});

describe('R19: the landlord approves by link, with no account', () => {
  it('sends a private link to a one-page summary that names only the two people chosen', async () => {
    const { member, lettingId } = await chosenWithLandlord();
    await askLandlord(member, lettingId);
    await askLandlord(member, lettingId);
    const { message, token } = await approvalLink(member, lettingId);
    expect(message).toMatchObject({
      toAddress: 'mary.byrne@example.ie',
      subject: '12 Ranelagh Road: please approve a tenant',
    });
    const summary = await loadApprovalSummary(token);
    expect(summary!.people.map((p) => [p.role, p.name, p.income?.meetsRule])).toEqual([
      ['preferred', 'Renter 1', true],
      ['backup', 'Renter 2', true],
    ]);
    const everything = JSON.stringify(summary);
    expect(everything).not.toContain('Renter 3');
    expect(everything).not.toMatch(/5200|520000|480000|@example/);
    const asked = await withOrg(member.organisationId, (tx) =>
      tx.select().from(landlordApprovals).where(eq(landlordApprovals.lettingId, lettingId)),
    );
    expect(asked).toHaveLength(1);
  });

  it('records the landlord’s answer for each person, as theirs, by ID only', async () => {
    const { member, lettingId } = await chosenWithLandlord();
    await askLandlord(member, lettingId);
    const { token } = await approvalLink(member, lettingId);
    expect(await answerApproval(token, { preferred: 'approve' })).toEqual({
      ok: false,
      errors: { backup: 'Choose approve or decline.' },
    });
    expect(await answerApproval(token, { preferred: 'approve', backup: 'decline' })).toEqual({
      ok: true,
    });
    const state = await approvalFor(member, lettingId);
    expect(state!.approval).toMatchObject({
      status: 'answered',
      preferredAnswer: 'approved',
      backupAnswer: 'declined',
    });
    const [logged] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.type, 'landlord.approval_answered')),
    );
    expect(logged).toMatchObject({ actorType: 'landlord' });
    expect(logged!.data).toEqual({
      approvalId: state!.approval!.id,
      preferred: 'approved',
      backup: 'declined',
    });
  });

  it('withdraws the request if the operator changes who they chose', async () => {
    const { member, lettingId, ids } = await chosenWithLandlord();
    await askLandlord(member, lettingId);
    const { token } = await approvalLink(member, lettingId);
    await chooseApplicants(member, lettingId, { preferredId: ids[2]!, backupId: ids[0]! });
    expect(await loadApprovalSummary(token)).toBeNull();
    expect(await answerApproval(token, { preferred: 'approve', backup: 'approve' })).toBeNull();
    expect((await approvalFor(member, lettingId))!.approval).toBeNull();
  });

  it('sends to the landlord, with replies going to the operator, not a renter’s thread', async () => {
    const { member, lettingId } = await chosenWithLandlord();
    await askLandlord(member, lettingId);
    const { message } = await approvalLink(member, lettingId);
    expect(
      await sendMessage({
        organisationId: member.organisationId,
        messageId: message.id,
        attempt: 1,
        maxAttempts: 10,
      }),
    ).toBe('sent');
    const [stored] = await db()
      .select()
      .from(devOutbox)
      .where(eq(devOutbox.toAddress, 'mary.byrne@example.ie'))
      .orderBy(desc(devOutbox.createdAt))
      .limit(1);
    expect(stored!.replyTo).toMatch(/^halcyon-[a-z0-9-]+@in\.gaff\.test$/);
  });
});
