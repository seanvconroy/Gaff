import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg } from '@/db/client';
import { applications, inboundEmails, messages, organisations } from '@/db/schema';
import type { Member } from '@/server/auth/member';
import { assignInboundEmail, dismissInboundEmail } from '@/server/enquiries/attention';
import { processInboundEmail } from '@/server/enquiries/process';
import { inboxFor, threadFor } from '@/server/inbox/queries';
import { receiveInboundEmail } from '@/server/enquiries/receive';
import { createLetting } from '@/server/lettings/create-letting';
import { daftEnquiry, gmailForwardingConfirmation, myhomeEnquiry } from '../fixtures/emails';
import { aLetting } from '../fixtures/lettings';
import { createTestMember } from './helpers';

async function slugOf(member: Member) {
  const [org] = await db()
    .select({ slug: organisations.inboundSlug })
    .from(organisations)
    .where(eq(organisations.id, member.organisationId));
  return org!.slug;
}

/** Receives a synthetic email at the member's Gaff address and processes it, as the worker would. */
async function deliver(
  member: Member,
  email: { from: string; replyTo?: string; subject: string; text: string },
  to?: string,
) {
  const recipient = to ?? `${await slugOf(member)}@in.gaff.test`;
  const providerMessageId = `<${crypto.randomUUID()}@test>`;
  expect(
    await receiveInboundEmail({
      provider: 'dev',
      providerMessageId,
      recipient,
      from: email.from,
      replyTo: email.replyTo,
      subject: email.subject,
      text: email.text,
      receivedAt: new Date(),
    }),
  ).toBe('stored');
  const [stored] = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ id: inboundEmails.id })
      .from(inboundEmails)
      .where(eq(inboundEmails.providerMessageId, providerMessageId)),
  );
  return processInboundEmail({ organisationId: member.organisationId, inboundEmailId: stored!.id });
}

async function setUp() {
  const member = await createTestMember();
  const { lettingId } = await createLetting(
    member,
    aLetting({
      daftUrl: 'https://www.daft.ie/for-rent/12-ranelagh-road/123456',
      myhomeUrl: 'https://www.myhome.ie/rentals/brochure/12-ranelagh-road/4567890',
    }),
  );
  return { member, lettingId };
}

describe('R6: reading and merging enquiries', () => {
  it('turns a Daft enquiry into an application for the right home, with the message kept', async () => {
    const { member, lettingId } = await setUp();
    const outcome = await deliver(member, daftEnquiry);
    expect(outcome).toMatchObject({ kind: 'enquiry', lettingId });
    const [application] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(applications).where(eq(applications.lettingId, lettingId)),
    );
    expect(application).toMatchObject({
      fullName: 'Aoife Byrne',
      emailNormalised: 'aoife.byrne@example.ie',
      phoneE164: '+353871234567',
      sources: ['daft'],
      status: 'enquired',
    });
    expect(application!.ref).toMatch(/^[a-z0-9]{12}$/);
    const [message] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(messages).where(eq(messages.applicationId, application!.id)),
    );
    expect(message).toMatchObject({ direction: 'inbound', kind: 'enquiry', author: 'renter' });
  });

  it('merges the same renter enquiring on Daft and then MyHome into one application', async () => {
    const { member, lettingId } = await setUp();
    await deliver(member, daftEnquiry);
    const second = await deliver(member, {
      ...myhomeEnquiry,
      text: myhomeEnquiry.text
        .replace('ciaran.os@example.ie', 'aoife.byrne@example.ie')
        .replace('Ciarán Ó Súilleabháin', 'Aoife Byrne'),
    });
    expect(second.kind).toBe('repeat');
    const all = await withOrg(member.organisationId, (tx) =>
      tx.select().from(applications).where(eq(applications.lettingId, lettingId)),
    );
    expect(all).toHaveLength(1);
    expect(all[0]!.sources.sort()).toEqual(['daft', 'myhome']);
  });

  /** UX-NV-17: emails Gaff couldn't place wait in Inbox, each as a conversation. */
  async function unplaced(member: Member) {
    const { conversations } = await inboxFor(member);
    const threads = [];
    for (const conversation of conversations.filter((c) => c.kind === 'email')) {
      const thread = await threadFor(member, { kind: 'email', id: conversation.key.slice(6) });
      if (thread?.kind === 'email') threads.push(thread);
    }
    return threads;
  }

  it('sets aside a Gmail forwarding confirmation for the operator, losing nothing', async () => {
    const { member } = await setUp();
    expect(await deliver(member, gmailForwardingConfirmation)).toEqual({ kind: 'needs_attention' });
    const waiting = await unplaced(member);
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({ problem: 'not_from_a_portal' });
    await dismissInboundEmail(member, waiting[0]!.emailId);
    expect(await unplaced(member)).toEqual([]);
    // Dealt with once: it can't be set aside, or matched to a home, a second time.
    await expect(dismissInboundEmail(member, waiting[0]!.emailId)).rejects.toThrow(
      'That email has already been dealt with.',
    );
  });

  it('lets the operator match an enquiry Gaff couldn’t place', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(
      member,
      aLetting({ addressLine1: '4 Main Street', daftUrl: '', myhomeUrl: '' }),
    );
    expect(await deliver(member, daftEnquiry)).toEqual({ kind: 'needs_attention' });
    const [waiting] = await unplaced(member);
    expect(waiting?.problem).toBe('no_matching_letting');
    const { applicationId } = await assignInboundEmail(member, waiting!.emailId, lettingId);
    const matched = await withOrg(member.organisationId, (tx) =>
      tx.select().from(applications).where(eq(applications.lettingId, lettingId)),
    );
    expect(matched.map((application) => application.id)).toEqual([applicationId]);
    await expect(assignInboundEmail(member, waiting!.emailId, lettingId)).rejects.toThrow(
      'That email has already been dealt with.',
    );
  });

  it('threads a renter’s reply to their application by the reply address', async () => {
    const { member } = await setUp();
    const first = await deliver(member, daftEnquiry);
    if (first.kind !== 'enquiry') throw new Error('expected an enquiry');
    const [application] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(applications).where(eq(applications.id, first.applicationId)),
    );
    const reply = await deliver(
      member,
      {
        from: 'Aoife Byrne <aoife.byrne@example.ie>',
        subject: 'Re: 12 Ranelagh Road',
        text: 'Is the heating gas?\n\nOn Tue, 4 Nov 2026, Halcyon wrote:\n> Hello',
      },
      `${await slugOf(member)}+${application!.ref}@in.gaff.test`,
    );
    expect(reply).toMatchObject({ kind: 'reply', applicationId: first.applicationId });
    const thread = await withOrg(member.organisationId, (tx) =>
      tx.select().from(messages).where(eq(messages.applicationId, first.applicationId)),
    );
    expect(thread.map((m) => [m.kind, m.body])).toContainEqual(['reply', 'Is the heating gas?']);
  });

  it('does nothing if the same email is processed twice', async () => {
    const { member } = await setUp();
    const first = await deliver(member, daftEnquiry);
    expect(first.kind).toBe('enquiry');
    const [stored] = await withOrg(member.organisationId, (tx) =>
      tx.select({ id: inboundEmails.id }).from(inboundEmails),
    );
    expect(
      await processInboundEmail({
        organisationId: member.organisationId,
        inboundEmailId: stored!.id,
      }),
    ).toEqual({ kind: 'already_processed' });
  });
});
