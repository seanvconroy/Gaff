import { and, desc, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { fakeDrafter } from '@/adapters/ai/fake';
import { withOrg } from '@/db/client';
import { aiDrafts, decisions, lettingFacts, messages, operatorQuestions } from '@/db/schema';
import { draftAnswersFor } from '@/server/answers/draft';
import { listAwaitingApproval, listOpenQuestions } from '@/server/answers/queries';
import {
  answerQuestion,
  approveMessage,
  discardDraft,
  setApproveBeforeSend,
} from '@/server/answers/review';
import { daftEnquiry } from '../fixtures/emails';
import { aLiveLetting, createTestMember, deliverEmail, type Member } from './helpers';

/** A Daft enquiry from a given renter asking the given message, processed and drafted. */
async function ask(
  member: Member,
  message: string,
  email = 'aoife.byrne@example.ie',
  phone = '087 123 4567',
) {
  const outcome = await deliverEmail(member, {
    ...daftEnquiry,
    replyTo: `Renter <${email}>`,
    text: daftEnquiry.text
      .replace('aoife.byrne@example.ie', email)
      .replace('087 123 4567', phone)
      .replace('Hi, is the apartment still available? Is there parking?\nThanks, Aoife', message),
  });
  if (outcome.kind !== 'enquiry' && outcome.kind !== 'repeat') {
    throw new Error('expected an enquiry');
  }
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
  return { applicationId: outcome.applicationId, inboundId: inbound!.id };
}

async function answerMessages(member: Member, applicationId: string) {
  return withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(messages)
      .where(and(eq(messages.applicationId, applicationId), eq(messages.kind, 'answer'))),
  );
}

describe('R8 and R29: answers from the facts, approved by a person', () => {
  it('drafts an answer from the facts, and holds it for approval (R29 on by default)', async () => {
    const member = await createTestMember();
    await aLiveLetting(member);
    const { applicationId, inboundId } = await ask(member, 'Is there parking?');
    const [answer] = await answerMessages(member, applicationId);
    expect(answer).toMatchObject({
      author: 'ai',
      status: 'awaiting_approval',
      inReplyToId: inboundId,
    });
    expect(answer!.body).toContain('You asked: Is there parking?\nParking: On-street parking.');
    expect(answer!.body).toMatch(/AI assistant$/);
    const [draft] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(aiDrafts).where(eq(aiDrafts.sourceMessageId, inboundId)),
    );
    expect(draft).toMatchObject({
      factIds: ['core:parking'],
      answered: 1,
      toOperator: 0,
      model: 'fake',
    });
    expect(await listAwaitingApproval(member)).toHaveLength(1);
  });

  it('sends it once a person approves, as their recorded decision', async () => {
    const member = await createTestMember();
    await aLiveLetting(member);
    const { applicationId } = await ask(member, 'Is there parking?');
    const [answer] = await answerMessages(member, applicationId);
    await approveMessage(member, answer!.id, `${answer!.body}\n\nP.S. It's a quiet street.`);
    const [approved] = await answerMessages(member, applicationId);
    expect(approved).toMatchObject({ status: 'scheduled', approvedBy: member.userId });
    expect(approved!.body).toContain("P.S. It's a quiet street.");
    const [decision] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(decisions).where(eq(decisions.kind, 'approve_message')),
    );
    expect(decision).toMatchObject({
      decidedBy: member.userId,
      basis: { messageId: answer!.id, edited: true },
    });
  });

  it('sends AI answers straight away when the admin switches approve-before-send off', async () => {
    const member = await createTestMember();
    await aLiveLetting(member);
    await setApproveBeforeSend(member, false);
    const { applicationId } = await ask(member, 'Is there parking?');
    const [answer] = await answerMessages(member, applicationId);
    expect(answer?.status).toBe('scheduled');
  });

  it('answers protected-ground questions with fixed, lawful wording, no AI, no approval (Q7)', async () => {
    const member = await createTestMember();
    await aLiveLetting(member);
    const { applicationId } = await ask(member, 'Do you accept HAP?');
    const [answer] = await answerMessages(member, applicationId);
    expect(answer).toMatchObject({ author: 'template', status: 'scheduled' });
    expect(answer!.body).toContain('Housing Assistance Payment (HAP) is welcome here');
  });

  it('passes what the facts don’t cover to a person, who answers once for everyone', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    const first = await ask(member, 'Is there a garden?');
    expect(await answerMessages(member, first.applicationId)).toEqual([]);
    const [question] = await listOpenQuestions(member);
    expect(question).toMatchObject({ question: 'Is there a garden?', reason: 'no_facts' });

    await answerQuestion(member, question!.id, 'Yes, a small back garden.', true);
    const [reply] = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.applicationId, first.applicationId),
            eq(messages.kind, 'operator_answer'),
          ),
        ),
    );
    expect(reply).toMatchObject({
      author: 'person',
      authorUserId: member.userId,
      status: 'scheduled',
    });
    const facts = await withOrg(member.organisationId, (tx) =>
      tx.select().from(lettingFacts).where(eq(lettingFacts.lettingId, lettingId)),
    );
    expect(facts.map((f) => f.question)).toContain('Is there a garden?');

    // The next renter who asks gets the answer from the remembered fact.
    const second = await ask(member, 'Does it have a garden?', 'ciaran@example.ie', '086 765 4321');
    const [answer] = await answerMessages(member, second.applicationId);
    expect(answer!.body).toContain('Yes, a small back garden.');
  });

  it('won’t remember or send an operator answer that touches a protected ground', async () => {
    const member = await createTestMember();
    await aLiveLetting(member);
    await ask(member, 'Is there a garden?');
    const [question] = await listOpenQuestions(member);
    await expect(
      answerQuestion(member, question!.id, 'Yes, ideal for kids.', true),
    ).rejects.toThrow(/family status/);
  });

  it('sends a request for a person straight to a person, with no AI', async () => {
    const member = await createTestMember();
    await aLiveLetting(member);
    const { inboundId } = await ask(member, 'Could I speak to someone about this please?');
    const questions = await withOrg(member.organisationId, (tx) =>
      tx.select().from(operatorQuestions).where(eq(operatorQuestions.sourceMessageId, inboundId)),
    );
    expect(questions.map((q) => q.reason)).toEqual(['asked_for_person']);
    const drafts = await withOrg(member.organisationId, (tx) =>
      tx.select().from(aiDrafts).where(eq(aiDrafts.sourceMessageId, inboundId)),
    );
    expect(drafts).toEqual([]);
  });

  it('when a person won’t send a draft, the questions go to them instead', async () => {
    const member = await createTestMember();
    await aLiveLetting(member);
    const { applicationId } = await ask(member, 'Is there parking?');
    const [answer] = await answerMessages(member, applicationId);
    await discardDraft(member, answer!.id);
    expect((await answerMessages(member, applicationId))[0]?.status).toBe('discarded');
    expect((await listOpenQuestions(member)).map((q) => q.reason)).toEqual(['draft_not_sent']);
  });

  it('if the AI is down, nothing is lost: the questions go to a person', async () => {
    const member = await createTestMember();
    await aLiveLetting(member);
    const spy = vi.spyOn(fakeDrafter, 'draftAnswers').mockRejectedValueOnce(new Error('timeout'));
    vi.spyOn(console, 'error').mockImplementationOnce(() => {});
    await ask(member, 'Is there parking?');
    spy.mockRestore();
    expect((await listOpenQuestions(member)).map((q) => q.question)).toEqual(['Is there parking?']);
  });

  it('only sends the AI redacted questions, never the renter’s name or contact details', async () => {
    const member = await createTestMember();
    await aLiveLetting(member);
    const spy = vi.spyOn(fakeDrafter, 'draftAnswers');
    await ask(member, 'Hi, Aoife Byrne here (087 123 4567). Is there parking, Aoife?');
    const sent = JSON.stringify(spy.mock.calls[0]?.[0]?.questions);
    spy.mockRestore();
    expect(sent).not.toMatch(/Aoife|Byrne|087|example\.ie/);
    expect(sent).toContain('[name]');
  });
});
