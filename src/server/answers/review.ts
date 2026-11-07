import { and, eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import {
  applications,
  lettingFacts,
  lettings,
  messages,
  operatorQuestions,
  organisations,
} from '@/db/schema';
import { OPERATOR_ANSWER_TEMPLATE, operatorAnswerEmail } from '@/copy/templates/answers';
import { protectedGroundProblem } from '@/domain/compliance/protected-grounds';
import { questionsIn } from '@/domain/answers/guardrails';
import type { Member } from '@/server/auth/member';
import { recordDecision } from '@/server/decisions/record-decision';
import { UserFacingError } from '@/server/errors';
import { queueMessage, scheduleApproved } from '@/server/messages/outbox';
import { recordEvent } from '@/server/record/events';
import { renterAddress } from '@/server/lettings/address';

/**
 * R29: a person approves an AI-written message before it goes, as it is or edited. Each
 * approval is a person's decision (ADR-0007), on the record.
 */
export async function approveMessage(member: Member, messageId: string, editedBody?: string) {
  if (editedBody !== undefined) {
    const problem = protectedGroundProblem(editedBody);
    if (problem) throw new UserFacingError(problem);
    if (editedBody.trim().length < 2) throw new UserFacingError('The message can’t be empty.');
  }
  await withOrg(member.organisationId, async (tx) => {
    const [message] = await tx
      .select()
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.status, 'awaiting_approval')))
      .for('update');
    if (!message) throw new UserFacingError('That message has already been dealt with.');
    const edited = editedBody !== undefined && editedBody.trim() !== message.body.trim();
    const decision = await recordDecision(tx, {
      member,
      kind: 'approve_message',
      lettingId: message.lettingId,
      basis: { messageId, edited },
    });
    await tx
      .update(messages)
      .set({
        status: 'scheduled',
        body: edited ? editedBody!.trim() : message.body,
        approvedBy: member.userId,
        approvedAt: new Date(),
        sendAt: new Date(),
      })
      .where(eq(messages.id, messageId));
    await scheduleApproved(tx, member.organisationId, messageId);
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId: message.lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'message.approved',
      subject: { type: 'decision', id: decision.id },
      data: { messageId, decisionId: decision.id, edited },
    });
  });
}

/** R29: a person decides an AI draft shouldn't go. The renter's questions go to them instead. */
export async function discardDraft(member: Member, messageId: string) {
  await withOrg(member.organisationId, async (tx) => {
    const [message] = await tx
      .select()
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.status, 'awaiting_approval')))
      .for('update');
    if (!message) throw new UserFacingError('That message has already been dealt with.');
    await tx.update(messages).set({ status: 'discarded' }).where(eq(messages.id, messageId));
    if (message.inReplyToId && message.applicationId) {
      const [source] = await tx.select().from(messages).where(eq(messages.id, message.inReplyToId));
      for (const question of questionsIn(source?.body ?? '')) {
        await tx.insert(operatorQuestions).values({
          organisationId: member.organisationId,
          lettingId: message.lettingId,
          applicationId: message.applicationId,
          sourceMessageId: message.inReplyToId,
          question,
          reason: 'draft_not_sent',
        });
      }
    }
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId: message.lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'message.discarded',
      subject: { type: 'message', id: messageId },
      data: { messageId },
    });
  });
}

/**
 * R8: the operator answers a question once. Their answer goes to the renter, and with
 * "remember" it becomes a fact Gaff reuses for everyone who asks about this home.
 */
export async function answerQuestion(
  member: Member,
  questionId: string,
  answer: string,
  remember: boolean,
) {
  const text = answer.trim();
  if (text.length < 2) throw new UserFacingError('Write an answer before sending.');
  const problem = protectedGroundProblem(text);
  if (problem) throw new UserFacingError(problem);
  await withOrg(member.organisationId, async (tx) => {
    const [row] = await tx
      .select({
        question: operatorQuestions,
        application: applications,
        letting: lettings,
        organisation: organisations,
      })
      .from(operatorQuestions)
      .innerJoin(applications, eq(applications.id, operatorQuestions.applicationId))
      .innerJoin(lettings, eq(lettings.id, operatorQuestions.lettingId))
      .innerJoin(organisations, eq(organisations.id, operatorQuestions.organisationId))
      .where(and(eq(operatorQuestions.id, questionId), eq(operatorQuestions.status, 'open')))
      .for('update', { of: operatorQuestions });
    if (!row) throw new UserFacingError('That question has already been answered.');
    let factId: string | null = null;
    if (remember) {
      const [fact] = await tx
        .insert(lettingFacts)
        .values({
          organisationId: member.organisationId,
          lettingId: row.letting.id,
          question: row.question.question,
          answer: text,
          source: 'operator_answer',
          createdBy: member.userId,
        })
        .returning({ id: lettingFacts.id });
      factId = fact!.id;
    }
    const { subject, body } = operatorAnswerEmail({
      renterName: row.application.fullName,
      operatorName: row.organisation.name,
      personName: member.name,
      address: await renterAddress(tx, row.letting, row.application.status),
      question: row.question.question,
      answer: text,
    });
    await queueMessage(tx, {
      organisationId: member.organisationId,
      lettingId: row.letting.id,
      applicationId: row.application.id,
      kind: 'operator_answer',
      author: 'person',
      authorUserId: member.userId,
      templateKey: OPERATOR_ANSWER_TEMPLATE,
      toAddress: row.application.email,
      subject,
      body,
      inReplyToId: row.question.sourceMessageId,
    });
    await tx
      .update(operatorQuestions)
      .set({
        status: 'answered',
        answerFactId: factId,
        answeredBy: member.userId,
        answeredAt: new Date(),
      })
      .where(eq(operatorQuestions.id, questionId));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId: row.letting.id,
      actor: { type: 'person', userId: member.userId },
      type: 'question.answered',
      subject: { type: 'operator_question', id: questionId },
      data: { questionId, remembered: remember },
    });
  });
}

/** R29: the organisation's admin switches approve-before-send on or off. */
export async function setApproveBeforeSend(member: Member, on: boolean) {
  if (member.role !== 'admin') throw new UserFacingError('Only an admin can change this.');
  await withOrg(member.organisationId, async (tx) => {
    await tx
      .update(organisations)
      .set({ approveBeforeSend: on })
      .where(eq(organisations.id, member.organisationId));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'settings.approve_before_send',
      data: { on },
    });
  });
}
