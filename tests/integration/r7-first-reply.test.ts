import { and, desc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg } from '@/db/client';
import { devOutbox, events, messages } from '@/db/schema';
import { createLetting } from '@/server/lettings/create-letting';
import { startTakingEnquiries } from '@/server/lettings/go-live';
import { recordRentCheck } from '@/server/lettings/rent-check';
import { setCriteria } from '@/server/lettings/set-criteria';
import { addViewingSession } from '@/server/lettings/viewing-sessions';
import { queueMessage, sendMessage } from '@/server/messages/outbox';
import { daftEnquiry, myhomeEnquiry } from '../fixtures/emails';
import { aLetting, aViewingSession } from '../fixtures/lettings';
import { aLiveLetting, createTestMember, deliverEmail, queuedJobs } from './helpers';

async function firstReplies(organisationId: string, applicationId: string) {
  return withOrg(organisationId, (tx) =>
    tx
      .select()
      .from(messages)
      .where(and(eq(messages.applicationId, applicationId), eq(messages.kind, 'first_reply'))),
  );
}

describe('R7: the first reply', () => {
  it('is queued with the enquiry, as fixed wording, even with approve-before-send on (Q1)', async () => {
    const member = await createTestMember();
    await aLiveLetting(member);
    const outcome = await deliverEmail(member, daftEnquiry);
    if (outcome.kind !== 'enquiry') throw new Error('expected an enquiry');
    const [reply] = await firstReplies(member.organisationId, outcome.applicationId);
    expect(reply).toMatchObject({
      direction: 'outbound',
      author: 'template',
      templateKey: 'first_reply@2',
      status: 'scheduled',
      toAddress: 'aoife.byrne@example.ie',
      subject: 'Your enquiry about 12 Ranelagh Road',
    });
    expect(reply!.body).toContain('AI assistant');
    expect(reply!.body).toMatch(/http:\/\/localhost:3000\/r\/[A-Za-z0-9_-]{43}/);
    const jobs = await queuedJobs('send_message');
    expect(jobs.some((job) => job.messageId === reply!.id)).toBe(true);
  });

  it('is sent from the operator, with replies coming back to Gaff in the renter’s thread', async () => {
    const member = await createTestMember({ organisation: 'Halcyon Lettings' });
    await aLiveLetting(member);
    const outcome = await deliverEmail(member, daftEnquiry);
    if (outcome.kind !== 'enquiry') throw new Error('expected an enquiry');
    const [reply] = await firstReplies(member.organisationId, outcome.applicationId);
    expect(
      await sendMessage({
        organisationId: member.organisationId,
        messageId: reply!.id,
        attempt: 1,
        maxAttempts: 10,
      }),
    ).toBe('sent');
    const [mail] = await db()
      .select()
      .from(devOutbox)
      .where(eq(devOutbox.toAddress, 'aoife.byrne@example.ie'))
      .orderBy(desc(devOutbox.createdAt))
      .limit(1);
    expect(mail?.fromAddress).toMatch(
      /^"Halcyon Lettings via Gaff" <halcyon-lettings(-\d+)?@mail\.gaff\.test>$/,
    );
    expect(mail?.replyTo).toMatch(/^halcyon-lettings(-\d+)?\+[a-z0-9]{12}@in\.gaff\.test$/);
    const [sent] = await firstReplies(member.organisationId, outcome.applicationId);
    expect(sent?.status).toBe('sent');
    expect(sent?.sentAt).not.toBeNull();
    // A second run of the same job sends nothing more.
    expect(
      await sendMessage({
        organisationId: member.organisationId,
        messageId: reply!.id,
        attempt: 2,
        maxAttempts: 10,
      }),
    ).toBe('skipped');
    const sentEvents = await withOrg(member.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.type, 'message.sent')),
    );
    expect(sentEvents.map((e) => e.data)).toEqual([
      { messageId: reply!.id, kind: 'first_reply', channel: 'email', author: 'template' },
    ]);
  });

  it('is sent once per renter, even when they enquire on both portals', async () => {
    const member = await createTestMember();
    await aLiveLetting(member);
    const first = await deliverEmail(member, daftEnquiry);
    await deliverEmail(member, {
      ...myhomeEnquiry,
      text: myhomeEnquiry.text.replace('ciaran.os@example.ie', 'aoife.byrne@example.ie'),
    });
    if (first.kind !== 'enquiry') throw new Error('expected an enquiry');
    expect(await firstReplies(member.organisationId, first.applicationId)).toHaveLength(1);
  });

  it('waits while the home is being set up, then goes out when it goes live', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    const outcome = await deliverEmail(member, daftEnquiry);
    if (outcome.kind !== 'enquiry') throw new Error('expected an enquiry');
    expect(await firstReplies(member.organisationId, outcome.applicationId)).toEqual([]);
    await addViewingSession(member, lettingId, aViewingSession());
    await setCriteria(member, lettingId, { noPets: false });
    await recordRentCheck(member, lettingId, { lastLet: 'never' }, 185_000);
    await startTakingEnquiries(member, lettingId);
    const [reply] = await firstReplies(member.organisationId, outcome.applicationId);
    expect(reply?.status).toBe('scheduled');
    // No criteria, so no questions to answer and no private link.
    expect(reply?.body).toContain('You don’t need to do anything else for now.');
  });
});

describe('Compliance: the AI writes only answers (CLAUDE.md rule 7)', () => {
  it('refuses an AI-written message of any other kind', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    const outcome = await deliverEmail(member, daftEnquiry);
    if (outcome.kind !== 'enquiry') throw new Error('expected an enquiry');
    await expect(
      withOrg(member.organisationId, (tx) =>
        queueMessage(tx, {
          organisationId: member.organisationId,
          lettingId,
          applicationId: outcome.applicationId,
          kind: 'invitation',
          author: 'ai',
          toAddress: 'aoife.byrne@example.ie',
          subject: 'x',
          body: 'x',
        }),
      ),
    ).rejects.toThrow(/only write answers/);
  });
});
