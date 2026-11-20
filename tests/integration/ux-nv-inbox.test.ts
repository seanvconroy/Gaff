import { and, desc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg } from '@/db/client';
import {
  decisions,
  devOutbox,
  events,
  lettingFacts,
  memberships,
  messages,
  operatorQuestions,
} from '@/db/schema';
import { needingYou } from '@/domain/inbox/conversations';
import { navCounts } from '@/domain/navigation/counts';
import { todayRows } from '@/domain/dashboard/today-rows';
import { draftAnswersFor } from '@/server/answers/draft';
import { answerQuestions, approveMessage, discardDraft } from '@/server/answers/review';
import { findMember } from '@/server/auth/member';
import { dashboardFor } from '@/server/dashboard/dashboard';
import { inboxFor, threadFor } from '@/server/inbox/queries';
import { createLetting } from '@/server/lettings/create-letting';
import { sendMessage } from '@/server/messages/outbox';
import { writeToOwner, writeToRenter } from '@/server/messages/write';
import { daftEnquiry, gmailForwardingConfirmation } from '../fixtures/emails';
import { aLetting } from '../fixtures/lettings';
import {
  aLiveLetting,
  createTestMember,
  createTestPerson,
  deliverEmail,
  type Member,
} from './helpers';

/** A made-up renter asks something by a Daft enquiry, and Gaff drafts what it can. */
async function ask(member: Member, message: string, name = 'Aoife Byrne', n = 1) {
  const email = `${name.toLowerCase().replace(/[^a-z]+/g, '.')}.${n}@example.ie`;
  const outcome = await deliverEmail(member, {
    ...daftEnquiry,
    replyTo: `${name} <${email}>`,
    text: daftEnquiry.text
      .replace('Aoife Byrne', name)
      .replace('aoife.byrne@example.ie', email)
      .replace('087 123 4567', `087 555 ${String(1000 + n)}`)
      .replace('Hi, is the apartment still available? Is there parking?\nThanks, Aoife', message),
  });
  if (outcome.kind !== 'enquiry' && outcome.kind !== 'repeat') throw new Error('not an enquiry');
  const [inbound] = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(eq(messages.applicationId, outcome.applicationId), eq(messages.direction, 'inbound')),
      )
      .orderBy(desc(messages.createdAt))
      .limit(1),
  );
  await draftAnswersFor({ organisationId: member.organisationId, messageId: inbound!.id });
  return { applicationId: outcome.applicationId, email, key: `renter-${outcome.applicationId}` };
}

async function aColleague(member: Member, name: string) {
  const person = await createTestPerson({ name });
  await db()
    .insert(memberships)
    .values({ organisationId: member.organisationId, userId: person.id, role: 'negotiator' });
  return (await findMember(person.id, member.organisationId))!;
}

async function renterThread(member: Member, applicationId: string) {
  const thread = await threadFor(member, { kind: 'renter', id: applicationId });
  if (thread?.kind !== 'renter') throw new Error('no conversation with this renter');
  return thread;
}

const messagesOf = (member: Member, applicationId: string) =>
  withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(messages)
      .where(eq(messages.applicationId, applicationId))
      .orderBy(messages.createdAt),
  );

const eventsOf = (member: Member) =>
  withOrg(member.organisationId, (tx) => tx.select().from(events));

/** What people on the team taught Gaff about a home by answering (not what set-up recorded). */
const remembered = (member: Member, lettingId: string) =>
  withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(lettingFacts)
      .where(
        and(eq(lettingFacts.lettingId, lettingId), eq(lettingFacts.source, 'operator_answer')),
      ),
  );

describe('UX-NV-13: Inbox is every conversation, newest first', () => {
  it('UX-NV-13: one conversation per renter per home, with who, which home and the last line', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    const aoife = await ask(member, 'Is there parking?');
    // The same renter writes again: still one conversation.
    await ask(member, 'Is it furnished?');
    const niamh = await ask(member, 'I would love to view it.', 'Niamh Kelly', 2);

    const { conversations } = await inboxFor(member);
    expect(conversations.map((c) => c.key).sort()).toEqual([aoife.key, niamh.key].sort());
    const withAoife = conversations.find((c) => c.key === aoife.key)!;
    expect(withAoife).toMatchObject({
      kind: 'renter',
      who: 'Aoife',
      home: '12 Ranelagh Road',
      lettingId,
      waiting: 'draft',
      needsYou: true,
    });
    // A draft isn't said until a person sends it, so it is never the last line.
    expect(withAoife.lastLine).not.toContain('You asked');
    // Nothing waits in Niamh's: Gaff's first reply is the last thing said.
    const withNiamh = conversations.find((c) => c.key === niamh.key)!;
    expect(withNiamh).toMatchObject({ who: 'Niamh', waiting: null, needsYou: false });
    expect(withNiamh.lastLine).toMatch(/^Gaff: /);
    // Newest first.
    const times = conversations.map((c) => c.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('UX-NV-5: Inbox’s badge counts the conversations that need the person, the same as the list', async () => {
    const member = await createTestMember();
    await aLiveLetting(member);
    // One renter with a draft and a question: one conversation, counted once (UX-NV-15).
    const both = await ask(member, 'Is it furnished? Is there a garden?');
    await ask(member, 'Is there a garden?', 'Niamh Kelly', 2);
    await deliverEmail(member, gmailForwardingConfirmation);

    const { conversations } = await inboxFor(member);
    const board = await dashboardFor(member);
    expect(needingYou(conversations)).toBe(3);
    expect(navCounts(board.today).inbox).toBe(3);
    // Today's row about one conversation opens it: two taps from Today to "Send" (UX-NV-2).
    const rows = todayRows(board.today, new Date());
    expect(rows.find((row) => row.kind === 'approvals')?.href).toBe(`/inbox/${both.key}`);
    const email = conversations.find((c) => c.kind === 'email')!;
    expect(rows.find((row) => row.kind === 'attention')?.href).toBe(`/inbox/${email.key}`);
  });

  it('UX-NV-13: a conversation waits on whoever leads its home, and says so to a colleague', async () => {
    const member = await createTestMember();
    await aLiveLetting(member);
    const { key } = await ask(member, 'Is there parking?');
    const colleague = await aColleague(member, 'Niamh Kelly');
    const { conversations } = await inboxFor(colleague);
    expect(conversations.find((c) => c.key === key)).toMatchObject({
      waiting: 'draft',
      needsYou: false,
      leadUserId: member.userId,
    });
    expect(needingYou(conversations)).toBe(0);
  });

  it('UX-NV-13: row-level security keeps another organisation’s conversations out', async () => {
    const member = await createTestMember();
    await aLiveLetting(member);
    const { applicationId } = await ask(member, 'Is there parking?');
    await deliverEmail(member, gmailForwardingConfirmation);
    const emailKey = (await inboxFor(member)).conversations.find((c) => c.kind === 'email')!.key;
    const [draft] = (await messagesOf(member, applicationId)).filter(
      (m) => m.status === 'awaiting_approval',
    );

    const stranger = await createTestMember();
    expect((await inboxFor(stranger)).conversations).toEqual([]);
    expect(await threadFor(stranger, { kind: 'renter', id: applicationId })).toBeNull();
    expect(await threadFor(stranger, { kind: 'email', id: emailKey.slice(6) })).toBeNull();
    await expect(approveMessage(stranger, draft!.id)).rejects.toThrow('already been dealt with');
    await expect(discardDraft(stranger, draft!.id)).rejects.toThrow('already been dealt with');
    await expect(writeToRenter(stranger, applicationId, 'Hello there.')).rejects.toThrow(
      'no longer holds',
    );
    expect((await messagesOf(member, applicationId)).some((m) => m.author === 'person')).toBe(
      false,
    );
  });
});

describe('UX-NV-14: a conversation opens as a thread, with the draft in the reply box', () => {
  it('UX-NV-14, UX-AI-15: what was said, oldest first, with Gaff’s messages marked as Gaff’s', async () => {
    const member = await createTestMember();
    await aLiveLetting(member);
    const { applicationId } = await ask(member, 'Is there parking?');
    const thread = await renterThread(member, applicationId);
    expect(thread).toMatchObject({ name: 'Aoife Byrne', firstName: 'Aoife' });
    expect(thread.home.address).toBe('12 Ranelagh Road');
    expect(thread.entries.map((e) => [e.from, e.name])).toEqual([
      ['them', 'Aoife'],
      ['gaff', 'Gaff'],
    ]);
    // Her private link is hers alone: nobody letting the home is shown it.
    expect(thread.entries[1]!.text).toContain('[their private link]');
    expect(thread.entries[1]!.text).not.toMatch(/\/r\/[A-Za-z0-9_-]{43}/);
    // The draft waits in the reply box, not in the thread.
    expect(thread.reply).toMatchObject({ kind: 'draft', questions: [], more: 0 });
    expect(thread.reply.kind === 'draft' && thread.reply.draft.body).toContain(
      'Yes, there’s on-street parking.',
    );
  });

  it('UX-NV-14: sending the draft is the person’s decision, and the thread then shows it', async () => {
    const member = await createTestMember();
    await aLiveLetting(member);
    const { applicationId } = await ask(member, 'Is there parking?');
    const before = await renterThread(member, applicationId);
    if (before.reply.kind !== 'draft') throw new Error('expected a draft');
    await approveMessage(member, before.reply.draft.id);
    const after = await renterThread(member, applicationId);
    expect(after.reply).toEqual({ kind: 'write' });
    expect(after.entries.at(-1)).toMatchObject({ from: 'gaff', state: 'sending' });
    const [decision] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(decisions).where(eq(decisions.kind, 'approve_message')),
    );
    expect(decision).toMatchObject({ decidedBy: member.userId });
    expect(needingYou((await inboxFor(member)).conversations)).toBe(0);
  });
});

describe('UX-NV-15, UX-NV-16: one draft answers both, and the answer is remembered', () => {
  it('UX-NV-15: an email with one thing Gaff knows and one it doesn’t is one conversation with one draft', async () => {
    const member = await createTestMember({ organisation: 'Halcyon Lettings' });
    await aLiveLetting(member);
    const { applicationId } = await ask(member, 'Is it furnished? Is there a garden?');
    const thread = await renterThread(member, applicationId);
    if (thread.reply.kind !== 'draft') throw new Error('expected a draft');
    expect(thread.reply.questions).toMatchObject([
      { question: 'Is there a garden?', reason: 'no_facts' },
    ]);
    // The part Gaff couldn't answer is marked where the draft says a person will reply.
    expect(thread.draftParts?.before).toContain(
      'You asked: Is it furnished?\nYes, it’s furnished.',
    );
    expect(thread.draftParts?.before).not.toContain('passed your other question');
    expect(thread.draftParts?.after).toContain('AI assistant');
    // One conversation, one thing to do on Today.
    const board = await dashboardFor(member);
    expect(board.today.filter((item) => item.kind === 'approvals')).toHaveLength(1);
    expect(board.today.filter((item) => item.kind === 'questions')).toHaveLength(0);
  });

  it('UX-NV-15, UX-NV-16: sending answers both in one email, and remembers the answer for the home', async () => {
    const member = await createTestMember({ organisation: 'Halcyon Lettings' });
    const { lettingId } = await aLiveLetting(member);
    const { applicationId } = await ask(member, 'Is it furnished? Is there a garden?');
    const thread = await renterThread(member, applicationId);
    if (thread.reply.kind !== 'draft') throw new Error('expected a draft');
    const [question] = thread.reply.questions;

    await approveMessage(member, thread.reply.draft.id, undefined, {
      answers: [{ questionId: question!.id, answer: 'Yes, a small back garden with a shed.' }],
      remember: true,
    });

    const sent = (await messagesOf(member, applicationId)).filter((m) => m.kind === 'answer');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ status: 'scheduled', approvedBy: member.userId });
    expect(sent[0]!.body).toContain('You asked: Is it furnished?\nYes, it’s furnished.');
    expect(sent[0]!.body).toContain(
      'You asked: Is there a garden?\nYes, a small back garden with a shed.',
    );
    expect(sent[0]!.body).not.toContain('passed your other question');
    // No second email: the one draft carried both.
    expect(
      (await messagesOf(member, applicationId)).filter((m) => m.kind === 'operator_answer'),
    ).toEqual([]);
    expect(await remembered(member, lettingId)).toMatchObject([
      { question: 'Is there a garden?', answer: 'Yes, a small back garden with a shed.' },
    ]);
    expect((await renterThread(member, applicationId)).reply).toEqual({ kind: 'write' });

    // The next person who asks is answered from what was remembered.
    const next = await ask(member, 'Does it have a garden?', 'Niamh Kelly', 2);
    const theirs = await renterThread(member, next.applicationId);
    expect(theirs.reply.kind === 'draft' && theirs.reply.draft.body).toContain(
      'Yes, a small back garden with a shed.',
    );
  });

  it('UX-NV-16: with the tick off, the answer goes to the renter and nothing is remembered', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    const { applicationId } = await ask(member, 'Is there a garden?');
    const thread = await renterThread(member, applicationId);
    if (thread.reply.kind !== 'questions') throw new Error('expected a question');
    await answerQuestions(
      member,
      [{ questionId: thread.reply.questions[0]!.id, answer: 'Yes, a small back garden.' }],
      false,
    );
    expect(await remembered(member, lettingId)).toEqual([]);
    const [reply] = (await messagesOf(member, applicationId)).filter(
      (m) => m.kind === 'operator_answer',
    );
    expect(reply).toMatchObject({ author: 'person', authorUserId: member.userId });
    expect(reply!.body).toContain('You asked: Is there a garden?\nYes, a small back garden.');
  });

  it('UX-NV-15: a question left empty stays open, and the draft still says a person will reply', async () => {
    const member = await createTestMember({ organisation: 'Halcyon Lettings' });
    await aLiveLetting(member);
    const { applicationId } = await ask(member, 'Is it furnished? Is there a garden?');
    const thread = await renterThread(member, applicationId);
    if (thread.reply.kind !== 'draft') throw new Error('expected a draft');
    await approveMessage(member, thread.reply.draft.id, undefined, {
      answers: [{ questionId: thread.reply.questions[0]!.id, answer: '   ' }],
      remember: true,
    });
    const [sent] = (await messagesOf(member, applicationId)).filter((m) => m.kind === 'answer');
    expect(sent!.body).toContain(
      'I’ve passed your other question to a person at Halcyon Lettings.',
    );
    const after = await renterThread(member, applicationId);
    expect(after.reply).toMatchObject({
      kind: 'questions',
      questions: [{ question: 'Is there a garden?' }],
    });
  });

  it('UX-NV-15: an answer that touches a protected ground stops the send, at its own field', async () => {
    const member = await createTestMember();
    await aLiveLetting(member);
    const { applicationId } = await ask(member, 'Is it furnished? Is there a garden?');
    const thread = await renterThread(member, applicationId);
    if (thread.reply.kind !== 'draft') throw new Error('expected a draft');
    const questionId = thread.reply.questions[0]!.id;
    await expect(
      approveMessage(member, thread.reply.draft.id, undefined, {
        answers: [{ questionId, answer: 'Yes, ideal for kids.' }],
        remember: true,
      }),
    ).rejects.toMatchObject({ field: `answer-${questionId}`, message: /family status/ });
    // Nothing went, and nothing was remembered.
    expect((await renterThread(member, applicationId)).reply.kind).toBe('draft');
    const open = await withOrg(member.organisationId, (tx) =>
      tx.select().from(operatorQuestions).where(eq(operatorQuestions.id, questionId)),
    );
    expect(open[0]?.status).toBe('open');
  });

  it('UX-NV-15: a draft can’t carry an answer to someone else’s question', async () => {
    const member = await createTestMember();
    await aLiveLetting(member);
    const aoife = await ask(member, 'Is it furnished? Is there a garden?');
    const niamh = await ask(member, 'Is there a shed?', 'Niamh Kelly', 2);
    const hers = await renterThread(member, aoife.applicationId);
    const theirs = await renterThread(member, niamh.applicationId);
    if (hers.reply.kind !== 'draft' || theirs.reply.kind !== 'questions') {
      throw new Error('expected a draft and a question');
    }
    await expect(
      approveMessage(member, hers.reply.draft.id, undefined, {
        answers: [{ questionId: theirs.reply.questions[0]!.id, answer: 'Yes, a small shed.' }],
        remember: false,
      }),
    ).rejects.toThrow('same conversation');
  });
});

describe('UX-NV-17: an email Gaff couldn’t place is a conversation with one question', () => {
  it('UX-NV-17: a forwarding confirmation has its code read out, and no home to choose', async () => {
    const member = await createTestMember();
    await aLiveLetting(member);
    await deliverEmail(member, gmailForwardingConfirmation);
    const { conversations } = await inboxFor(member);
    expect(conversations).toMatchObject([
      { kind: 'email', who: 'Gmail Team', home: null, waiting: 'email', needsYou: true },
    ]);
    const thread = await threadFor(member, { kind: 'email', id: conversations[0]!.key.slice(6) });
    if (thread?.kind !== 'email') throw new Error('expected the email');
    expect(thread.confirmation).toEqual({
      service: 'gmail',
      code: '123456789',
      link: null,
      forwardingFrom: 'ann@halcyon.test',
    });
    expect(thread.homes).toEqual([]);
    expect(thread.entries).toMatchObject([{ from: 'them', name: 'Gmail Team' }]);
  });

  it('UX-NV-17: an enquiry Gaff couldn’t match offers the homes taking enquiries, and no others', async () => {
    const member = await createTestMember();
    // Live, but with no advert address Gaff could match the enquiry to.
    const live = await aLiveLetting(member, { addressLine1: '4 Main Street', daftUrl: '' });
    await createLetting(member, aLetting({ addressLine1: '9 Canal View', daftUrl: '' }));
    await aLiveLetting(await createTestMember(), { addressLine1: '1 Other Agency Row' });
    expect(await deliverEmail(member, daftEnquiry)).toEqual({ kind: 'needs_attention' });
    const { conversations } = await inboxFor(member);
    const thread = await threadFor(member, { kind: 'email', id: conversations[0]!.key.slice(6) });
    if (thread?.kind !== 'email') throw new Error('expected the email');
    expect(thread.confirmation).toBeNull();
    expect(thread.homes).toEqual([{ lettingId: live.lettingId, address: '4 Main Street' }]);
  });
});

describe('UX-NV-18: a person writes to a renter or an owner themselves', () => {
  it('UX-NV-18: it is sent as written and marked as theirs, to the renter and in the thread', async () => {
    const member = await createTestMember({ name: 'Ann Power', organisation: 'Halcyon Lettings' });
    await aLiveLetting(member);
    const { applicationId, email } = await ask(member, 'I would love to view it.');
    const words = 'Hi Aoife,\n\nThe side gate is open on the day.\n  Ann';
    const messageId = await writeToRenter(member, applicationId, words);

    const [written] = (await messagesOf(member, applicationId)).filter((m) => m.id === messageId);
    expect(written).toMatchObject({
      kind: 'message',
      author: 'person',
      authorUserId: member.userId,
      templateKey: null,
      body: words,
      toAddress: email,
      status: 'scheduled',
    });
    expect(
      await sendMessage({
        organisationId: member.organisationId,
        messageId,
        attempt: 1,
        maxAttempts: 10,
      }),
    ).toBe('sent');
    const [mail] = await db()
      .select()
      .from(devOutbox)
      .where(eq(devOutbox.toAddress, email))
      .orderBy(desc(devOutbox.createdAt))
      .limit(1);
    expect(mail?.fromAddress).toMatch(/^"Ann Power, Halcyon Lettings via Gaff" </);
    expect(mail?.text).toContain(words);

    const thread = await renterThread(member, applicationId);
    expect(thread.entries.at(-1)).toMatchObject({ from: 'you', name: 'You', text: words });
    // A colleague reads whose it is, by first name.
    const colleague = await aColleague(member, 'Niamh Kelly');
    const theirs = await renterThread(colleague, applicationId);
    expect(theirs.entries.at(-1)).toMatchObject({ from: 'colleague', name: 'Ann' });
    const { conversations } = await inboxFor(member);
    expect(conversations[0]?.lastLine).toBe('You: The side gate is open on the day.');
  });

  it('UX-NV-18: a message that touches a protected ground isn’t sent', async () => {
    const member = await createTestMember();
    await aLiveLetting(member);
    const { applicationId } = await ask(member, 'I would love to view it.');
    await expect(
      writeToRenter(member, applicationId, 'It’s ideal for a young family.'),
    ).rejects.toMatchObject({ field: 'body' });
    await expect(writeToRenter(member, applicationId, ' ')).rejects.toMatchObject({
      field: 'body',
      message: 'Write your message before sending.',
    });
    expect((await messagesOf(member, applicationId)).some((m) => m.author === 'person')).toBe(
      false,
    );
  });

  it('UX-NV-18: a message to the owner starts a conversation with them, about that home', async () => {
    const member = await createTestMember({ name: 'Ann Power' });
    const { lettingId } = await aLiveLetting(member);
    expect((await inboxFor(member)).conversations).toEqual([]);
    const messageId = await writeToOwner(
      member,
      lettingId,
      'Two viewings are booked for Saturday.',
    );

    const { conversations } = await inboxFor(member);
    expect(conversations).toMatchObject([
      {
        key: `owner-${lettingId}`,
        kind: 'owner',
        who: 'Mary',
        role: 'Owner',
        home: '12 Ranelagh Road',
        lastLine: 'You: Two viewings are booked for Saturday.',
        needsYou: false,
      },
    ]);
    const thread = await threadFor(member, { kind: 'owner', id: lettingId });
    expect(thread).toMatchObject({ kind: 'owner', name: 'Mary Byrne', canWrite: true });
    const [stored] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(messages).where(eq(messages.id, messageId)),
    );
    expect(stored).toMatchObject({
      kind: 'owner_message',
      applicationId: null,
      author: 'person',
      toAddress: 'mary.byrne@example.ie',
    });
  });
});

describe('Rule 8: what Inbox does is on the record, with no personal data', () => {
  it('UX-NV-15, UX-NV-18: events hold IDs, codes and numbers, and none of anyone’s words', async () => {
    const member = await createTestMember({ name: 'Ann Power' });
    const { lettingId } = await aLiveLetting(member);
    const { applicationId, email } = await ask(member, 'Is it furnished? Is there a garden?');
    const thread = await renterThread(member, applicationId);
    if (thread.reply.kind !== 'draft') throw new Error('expected a draft');
    await approveMessage(member, thread.reply.draft.id, undefined, {
      answers: [{ questionId: thread.reply.questions[0]!.id, answer: 'Yes, a small back garden.' }],
      remember: true,
    });
    const messageId = await writeToRenter(member, applicationId, 'The side gate is open.');
    await writeToOwner(member, lettingId, 'Two viewings are booked.');

    const recorded = await eventsOf(member);
    const written = recorded.filter((event) => event.type === 'message.written');
    expect(written.map((event) => event.data)).toEqual(
      expect.arrayContaining([
        { messageId, to: 'renter' },
        { messageId: expect.any(String), to: 'owner' },
      ]),
    );
    expect(written.every((event) => event.actorId === member.userId)).toBe(true);
    expect(recorded.some((event) => event.type === 'question.answered')).toBe(true);
    expect(recorded.some((event) => event.type === 'message.approved')).toBe(true);
    const everything = JSON.stringify(recorded.map((event) => event.data));
    for (const secret of ['Aoife', 'Byrne', email, 'garden', 'side gate', 'viewings are booked']) {
      expect(everything).not.toContain(secret);
    }
  });
});
