import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import {
  accessLinks,
  applications,
  bookings,
  decisions,
  events,
  inboundEmails,
  lettings,
  messages,
  viewingSlots,
} from '@/db/schema';
import { closeLetting } from '@/server/lettings/close';
import { sweepPersonalData } from '@/server/retention/sweep';
import { inviteToView } from '@/server/shortlist/invite';
import { loadRenterPage } from '@/server/renter/answers';
import {
  aLiveLetting,
  aRenterEnquires,
  bookAs,
  createTestMember,
  deliverEmail,
  tokenInMessage,
} from './helpers';
import { draftAnswersFor } from '@/server/answers/draft';
import { operatorQuestions, organisations } from '@/db/schema';
import { db } from '@/db/client';

const day = 86_400_000;

async function aClosedLetting() {
  const member = await createTestMember();
  const { lettingId } = await aLiveLetting(member);
  const booked = await aRenterEnquires(member, 1, { occupants: '1', hasPets: 'no' });
  const other = await aRenterEnquires(member, 2, { occupants: '2', hasPets: 'no' });
  await inviteToView(member, lettingId, { chosenIds: [booked], waitlistSize: 1 });
  const [slot] = await withOrg(member.organisationId, (tx) =>
    tx.select().from(viewingSlots).where(eq(viewingSlots.lettingId, lettingId)).limit(1),
  );
  const token = await tokenInMessage(member, booked, 'invitation');
  await bookAs(token, slot!.id);
  return { member, lettingId, booked, other, token };
}

const read = (member: Awaited<ReturnType<typeof createTestMember>>, lettingId: string) =>
  withOrg(member.organisationId, async (tx) => ({
    letting: (await tx.select().from(lettings).where(eq(lettings.id, lettingId)))[0]!,
    people: await tx.select().from(applications).where(eq(applications.lettingId, lettingId)),
    sent: await tx
      .select()
      .from(messages)
      .where(and(eq(messages.lettingId, lettingId), eq(messages.direction, 'outbound'))),
    booking: await tx.select().from(bookings).where(eq(bookings.lettingId, lettingId)),
    emails: await tx.select().from(inboundEmails).where(eq(inboundEmails.lettingId, lettingId)),
    log: await tx.select().from(events).where(eq(events.lettingId, lettingId)),
  }));

describe('R26 (basic): closing a letting', () => {
  it('is a person’s decision; everyone hears back, and their details get a deletion date', async () => {
    const { member, lettingId } = await aClosedLetting();
    const result = await closeLetting(member, lettingId, 'let');
    expect(result.told).toBe(2);
    const state = await read(member, lettingId);
    expect(state.letting).toMatchObject({ status: 'let', stage: 'close' });
    expect(state.people.every((p) => p.deleteAfter === result.deleteAfter)).toBe(true);
    const closing = state.sent.filter((m) => m.kind === 'letting_closed');
    expect(closing).toHaveLength(2);
    expect(closing[0]!.subject).toBe('12 Ranelagh Road has been let');
    // The viewing still to come, and its reminders, are cancelled.
    expect(state.booking[0]!.status).toBe('cancelled');
    expect(
      state.sent.filter((m) => m.kind === 'reminder').every((m) => m.status === 'cancelled'),
    ).toBe(true);
    const [decision] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(decisions).where(eq(decisions.kind, 'close_letting')),
    );
    expect(decision?.basis).toMatchObject({ outcome: 'let', applications: 2 });
    await expect(closeLetting(member, lettingId, 'let')).rejects.toThrow(
      'Only a letting that’s taking enquiries can be closed.',
    );
  });
});

describe('R26 (basic): the retention job', () => {
  it('deletes nothing before the deletion date', async () => {
    const { member, lettingId } = await aClosedLetting();
    await closeLetting(member, lettingId, 'withdrawn');
    await sweepPersonalData(new Date(), member.organisationId);
    const state = await read(member, lettingId);
    expect(state.people.every((p) => p.personalDataDeletedAt === null)).toBe(true);
  });

  it('on the date, deletes names, contact details, answers and message text, and revokes links', async () => {
    const { member, lettingId, booked, token } = await aClosedLetting();
    const { deleteAfter } = await closeLetting(member, lettingId, 'let');
    const onTheDay = new Date(`${deleteAfter}T12:00:00Z`);
    const swept = await sweepPersonalData(onTheDay, member.organisationId);
    expect(swept.applications).toBeGreaterThanOrEqual(2);

    const state = await read(member, lettingId);
    for (const person of state.people) {
      expect(person).toMatchObject({
        fullName: 'Deleted',
        phone: null,
        phoneE164: null,
        answers: null,
      });
      expect(person.email).toBe(`deleted-${person.id}`);
      expect(person.personalDataDeletedAt).not.toBeNull();
    }
    expect(state.sent.every((m) => m.body === '' && m.toAddress === null)).toBe(true);
    expect(state.emails.every((e) => e.text === '' && e.fromAddress === '')).toBe(true);
    const links = await withOrg(member.organisationId, (tx) =>
      tx.select().from(accessLinks).where(eq(accessLinks.subjectId, booked)),
    );
    expect(links.every((l) => l.revokedAt !== null)).toBe(true);
    expect(await loadRenterPage(token)).toBeNull();

    // The record stays, with each deletion logged by ID only.
    const deletions = state.log.filter((e) => e.type === 'application.personal_data_deleted');
    expect(deletions).toHaveLength(2);
    expect(deletions[0]!.data).toEqual({
      applicationId: expect.any(String),
      backstop: false,
    });
    expect(state.log.some((e) => e.type === 'letting.closed')).toBe(true);
  });

  it('has a backstop for lettings nobody closed, 180 days after the last enquiry', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    const id = await aRenterEnquires(member, 1);
    await sweepPersonalData(new Date(Date.now() + 179 * day), member.organisationId);
    let [person] = (await read(member, lettingId)).people;
    expect(person!.personalDataDeletedAt).toBeNull();
    await sweepPersonalData(new Date(Date.now() + 181 * day), member.organisationId);
    [person] = (await read(member, lettingId)).people;
    expect(person).toMatchObject({ id, fullName: 'Deleted' });
  });

  it('clears emails Gaff couldn’t place, 30 days after they arrived', async () => {
    const member = await createTestMember();
    const { deliverEmail } = await import('./helpers');
    const { gmailForwardingConfirmation } = await import('../fixtures/emails');
    await deliverEmail(member, gmailForwardingConfirmation);
    await sweepPersonalData(new Date(Date.now() + 29 * day), member.organisationId);
    const kept = await withOrg(member.organisationId, (tx) => tx.select().from(inboundEmails));
    expect(kept[0]!.text).not.toBe('');
    await sweepPersonalData(new Date(Date.now() + 31 * day), member.organisationId);
    const cleared = await withOrg(member.organisationId, (tx) => tx.select().from(inboundEmails));
    expect(cleared[0]).toMatchObject({ text: '', fromAddress: '', subject: '' });
  });

  it('runs daily across every organisation, as the system, deleting only what’s due', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    await aRenterEnquires(member, 1);
    const swept = await sweepPersonalData();
    expect(swept.applications).toBeGreaterThanOrEqual(0);
    const [person] = (await read(member, lettingId)).people;
    expect(person!.personalDataDeletedAt).toBeNull();
  });
});

/** A renter replies in their thread, at <slug>+<ref>@, as their email app would. */
async function replyFrom(
  member: Awaited<ReturnType<typeof createTestMember>>,
  applicationId: string,
  text: string,
) {
  const [org] = await db()
    .select({ slug: organisations.inboundSlug })
    .from(organisations)
    .where(eq(organisations.id, member.organisationId));
  const [person] = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ ref: applications.ref })
      .from(applications)
      .where(eq(applications.id, applicationId)),
  );
  return deliverEmail(
    member,
    { from: 'someone@example.ie', subject: 'Re: 12 Ranelagh Road', text },
    `${org!.slug}+${person!.ref}@in.gaff.test`,
  );
}

describe('R26 (basic): after closing and after deletion', () => {
  it('passes a renter’s message on a closed letting to a person, not the AI', async () => {
    const { member, lettingId, other } = await aClosedLetting();
    await closeLetting(member, lettingId, 'let');
    const reply = await replyFrom(member, other, 'Is it still available? Can I talk to someone?');
    expect(reply).toMatchObject({ kind: 'reply' });
    await draftAnswersFor({
      organisationId: member.organisationId,
      messageId: (reply as { messageId: string }).messageId,
    });
    const questions = await withOrg(member.organisationId, (tx) =>
      tx.select().from(operatorQuestions).where(eq(operatorQuestions.applicationId, other)),
    );
    expect(questions.map((q) => q.reason)).toEqual(['letting_closed']);
    const answers = (await read(member, lettingId)).sent.filter((m) => m.kind === 'answer');
    expect(answers).toEqual([]);
  });

  it('never re-attaches a reply to someone whose details were deleted', async () => {
    const { member, lettingId, other } = await aClosedLetting();
    const { deleteAfter } = await closeLetting(member, lettingId, 'withdrawn');
    await sweepPersonalData(new Date(`${deleteAfter}T12:00:00Z`), member.organisationId);
    const reply = await replyFrom(member, other, 'Hi again, my new number is 087 000 0000');
    expect(reply).toEqual({ kind: 'needs_attention' });
    const [person] = (await read(member, lettingId)).people.filter((p) => p.id === other);
    expect(person).toMatchObject({ fullName: 'Deleted', phone: null });
    const setAside = await withOrg(member.organisationId, (tx) =>
      tx.select().from(inboundEmails).where(eq(inboundEmails.problem, 'details_deleted')),
    );
    expect(setAside).toHaveLength(1);
    expect(setAside[0]!.applicationId).toBeNull();
  });
});
