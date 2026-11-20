import { and, eq, inArray } from 'drizzle-orm';
import { type Tx, withOrg } from '@/db/client';
import {
  applications,
  lettingFacts,
  lettings,
  messages,
  operatorQuestions,
  organisations,
} from '@/db/schema';
import {
  OPERATOR_ANSWER_TEMPLATE,
  draftWithAnswers,
  operatorAnswersEmail,
} from '@/copy/templates/answers';
import { protectedGroundProblem } from '@/domain/compliance/protected-grounds';
import { questionsIn } from '@/domain/answers/guardrails';
import { answerField, canRemember } from '@/domain/inbox/thread';
import { CONFLICT_MESSAGE, memberAppliedIn } from '@/server/accounts/conflict';
import { assertMayActOn, requirePermission } from '@/server/team/permissions';
import type { Member } from '@/server/auth/member';
import { recordDecision } from '@/server/decisions/record-decision';
import { UserFacingError } from '@/server/errors';
import { queueMessage, scheduleApproved } from '@/server/messages/outbox';
import { recordEvent } from '@/server/record/events';

/** A person's answer to one question only they can answer (R8). */
export interface PersonAnswer {
  questionId: string;
  answer: string;
}

/** What a person wrote, checked before anything is stored or sent. Blank answers are dropped. */
function checkedAnswers(answers: readonly PersonAnswer[]): PersonAnswer[] {
  const written = answers
    .map((a) => ({ questionId: a.questionId, answer: a.answer.trim() }))
    .filter((a) => a.answer.length > 0);
  for (const { questionId, answer } of written) {
    if (answer.length < 2) {
      throw new UserFacingError('Write an answer before sending.', answerField(questionId));
    }
    if (answer.length > 2000) {
      throw new UserFacingError('Keep an answer under 2,000 characters.', answerField(questionId));
    }
    const problem = protectedGroundProblem(answer);
    if (problem) throw new UserFacingError(problem, answerField(questionId));
  }
  return written;
}

/**
 * R8: records a person's answers to open questions, all from one renter about one home, in the
 * caller's transaction. With "remember", each answer to a real question becomes a fact Gaff
 * reuses for everyone who asks about that home (UX-NV-16). Returns what was asked and answered,
 * in the order asked, for the email that carries them.
 */
async function recordAnswers(
  tx: Tx,
  member: Member,
  answers: readonly PersonAnswer[],
  remember: boolean,
  only?: { applicationId: string | null },
) {
  const rows = await tx
    .select()
    .from(operatorQuestions)
    .where(
      and(
        inArray(
          operatorQuestions.id,
          answers.map((a) => a.questionId),
        ),
        eq(operatorQuestions.status, 'open'),
      ),
    )
    .orderBy(operatorQuestions.createdAt, operatorQuestions.id)
    .for('update');
  const [first] = rows;
  if (!first || rows.length !== new Set(answers.map((a) => a.questionId)).size) {
    throw new UserFacingError('That question has already been answered.');
  }
  // One email goes to one renter: every question must be theirs, about the same home.
  const applicationId = only ? only.applicationId : first.applicationId;
  if (rows.some((row) => row.applicationId !== applicationId)) {
    throw new UserFacingError('Those questions aren’t all from the same conversation.');
  }
  const answerTo = new Map(answers.map((a) => [a.questionId, a.answer]));
  const answered: Array<{ question: string; answer: string }> = [];
  for (const row of rows) {
    const answer = answerTo.get(row.id)!;
    const remembered = remember && canRemember(row.reason);
    let factId: string | null = null;
    if (remembered) {
      const [fact] = await tx
        .insert(lettingFacts)
        .values({
          organisationId: member.organisationId,
          lettingId: row.lettingId,
          question: row.question,
          answer,
          source: 'operator_answer',
          createdBy: member.userId,
        })
        .returning({ id: lettingFacts.id });
      factId = fact!.id;
    }
    await tx
      .update(operatorQuestions)
      .set({
        status: 'answered',
        answerFactId: factId,
        answeredBy: member.userId,
        answeredAt: new Date(),
      })
      .where(eq(operatorQuestions.id, row.id));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId: row.lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'question.answered',
      subject: { type: 'operator_question', id: row.id },
      data: { questionId: row.id, remembered },
    });
    answered.push({ question: row.question, answer });
  }
  return { answered, first };
}

/**
 * R29: a person approves an AI-written message before it goes, as it is or edited. Each
 * approval is a person's decision (ADR-0007), on the record.
 *
 * UX-NV-15: where the renter also asked something Gaff couldn't answer, the person can answer
 * it in the same send (`also`). Their answers go into the one draft, in the answer email's own
 * words, and the renter gets one email that answers both. A question left blank stays open, and
 * the draft still tells the renter a person will reply about it.
 */
export async function approveMessage(
  member: Member,
  messageId: string,
  editedBody?: string,
  also?: { answers: readonly PersonAnswer[]; remember: boolean },
) {
  if (editedBody !== undefined) {
    const problem = protectedGroundProblem(editedBody);
    if (problem) throw new UserFacingError(problem, 'body');
    if (editedBody.trim().length < 2) {
      throw new UserFacingError('The message can’t be empty.', 'body');
    }
  }
  const answers = checkedAnswers(also?.answers ?? []);
  await withOrg(member.organisationId, async (tx) => {
    const [message] = await tx
      .select()
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.status, 'awaiting_approval')))
      .for('update');
    if (!message) throw new UserFacingError('That message has already been dealt with.');
    const edited = editedBody !== undefined && editedBody.trim() !== message.body.trim();
    let body = edited ? editedBody!.trim() : message.body;
    if (answers.length > 0) {
      const { answered } = await recordAnswers(tx, member, answers, also?.remember ?? false, {
        applicationId: message.applicationId,
      });
      const [organisation] = await tx
        .select({ name: organisations.name })
        .from(organisations)
        .where(eq(organisations.id, member.organisationId));
      const stillOpen = message.applicationId
        ? await tx
            .select({ id: operatorQuestions.id })
            .from(operatorQuestions)
            .where(
              and(
                eq(operatorQuestions.applicationId, message.applicationId),
                eq(operatorQuestions.status, 'open'),
              ),
            )
            .limit(1)
        : [];
      body = draftWithAnswers({
        body,
        operatorName: organisation!.name,
        answers: answered,
        stillWithAPerson: stillOpen.length > 0,
      });
    }
    const decision = await recordDecision(tx, {
      member,
      kind: 'approve_message',
      lettingId: message.lettingId,
      basis: { messageId, edited, answered: answers.length },
    });
    await tx
      .update(messages)
      .set({
        status: 'scheduled',
        body,
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
      // What Gaff couldn't answer is with the person already: it isn't asked of them twice.
      const waiting = await tx
        .select({ question: operatorQuestions.question })
        .from(operatorQuestions)
        .where(
          and(
            eq(operatorQuestions.sourceMessageId, message.inReplyToId),
            eq(operatorQuestions.status, 'open'),
          ),
        );
      const asked = new Set(waiting.map((q) => q.question));
      for (const question of questionsIn(source?.body ?? '')) {
        if (asked.has(question)) continue;
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
 * R8: a person answers what only they can, in a renter's conversation. Their answers go to the
 * renter in one email, signed by them, and with "remember" each becomes a fact Gaff reuses for
 * everyone who asks about this home. A question left blank stays open.
 */
export async function answerQuestions(
  member: Member,
  answers: readonly PersonAnswer[],
  remember: boolean,
) {
  const written = checkedAnswers(answers);
  if (written.length === 0) {
    throw new UserFacingError(
      'Write an answer before sending.',
      answers[0] ? answerField(answers[0].questionId) : undefined,
    );
  }
  await withOrg(member.organisationId, async (tx) => {
    const { answered, first } = await recordAnswers(tx, member, written, remember);
    // UX-AC-14: nobody works on the letting of a home they asked about themselves.
    if (await memberAppliedIn(tx, member, first.lettingId)) {
      throw new UserFacingError(CONFLICT_MESSAGE);
    }
    // UX-AG-8: only a member who may act on the letting now answers for it.
    await assertMayActOn(tx, member, first.lettingId);
    const [row] = await tx
      .select({ application: applications, letting: lettings, organisation: organisations })
      .from(applications)
      .innerJoin(lettings, eq(lettings.id, applications.lettingId))
      .innerJoin(organisations, eq(organisations.id, applications.organisationId))
      .where(eq(applications.id, first.applicationId));
    if (!row) throw new UserFacingError('That question has already been answered.');
    const { subject, body } = operatorAnswersEmail({
      renterName: row.application.fullName,
      operatorName: row.organisation.name,
      personName: member.name,
      address: row.letting.addressLine1,
      answers: answered,
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
      inReplyToId: first.sourceMessageId,
    });
  });
}

/** R8: the operator answers one question. See `answerQuestions`. */
export async function answerQuestion(
  member: Member,
  questionId: string,
  answer: string,
  remember: boolean,
) {
  await answerQuestions(member, [{ questionId, answer }], remember);
}

/** R29: the organisation's admin switches approve-before-send on or off. */
export async function setApproveBeforeSend(member: Member, on: boolean) {
  await requirePermission(member, 'change_settings');
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
