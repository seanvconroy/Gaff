import { and, eq } from 'drizzle-orm';
import { aiDrafter } from '@/adapters/ai';
import { withOrg, type Tx } from '@/db/client';
import {
  aiDrafts,
  applications,
  lettings,
  messages,
  operatorQuestions,
  organisations,
} from '@/db/schema';
import { ANSWER_TEMPLATE, answersEmail } from '@/copy/templates/answers';
import {
  asksForAPerson,
  checkDraftItem,
  fixedAnswerFor,
  questionsIn,
  redact,
  type CheckedItem,
  type Fact,
} from '@/domain/answers/guardrails';
import { enqueue } from '@/server/jobs/enqueue';
import { queueMessage } from '@/server/messages/outbox';
import { recordEvent } from '@/server/record/events';
import { factsFor } from './facts';

/** Whether a renter's message needs answers at all (questions, or asking for a person). */
export function needsAnswers(body: string): boolean {
  return asksForAPerson(body) || questionsIn(body).length > 0;
}

/** Queues drafting for a renter's message, in the caller's transaction. */
export async function queueDraft(tx: Tx, organisationId: string, messageId: string) {
  await enqueue(
    tx,
    'draft_answers',
    { organisationId, messageId },
    { jobKey: `draft:${messageId}` },
  );
}

/**
 * R8: answers a renter's questions. Fixed, lawful answers for protected-ground questions; AI
 * answers only from the letting's facts, each checked; everything else to the operator. Runs
 * in the worker, in three steps, so no database transaction is held open during the AI call.
 */
export async function draftAnswersFor(input: { organisationId: string; messageId: string }) {
  // 1. Read what we need.
  const context = await withOrg(input.organisationId, async (tx) => {
    const [row] = await tx
      .select({
        message: messages,
        application: applications,
        letting: lettings,
        organisation: organisations,
      })
      .from(messages)
      .innerJoin(applications, eq(applications.id, messages.applicationId))
      .innerJoin(lettings, eq(lettings.id, messages.lettingId))
      .innerJoin(organisations, eq(organisations.id, messages.organisationId))
      .where(and(eq(messages.id, input.messageId), eq(messages.direction, 'inbound')));
    if (!row || row.letting.status === 'draft') return null;
    const [done] = await tx
      .select({ id: aiDrafts.id })
      .from(aiDrafts)
      .where(eq(aiDrafts.sourceMessageId, input.messageId));
    const [asked] = await tx
      .select({ id: operatorQuestions.id })
      .from(operatorQuestions)
      .where(eq(operatorQuestions.sourceMessageId, input.messageId))
      .limit(1);
    if (done || asked) return null;
    return { ...row, facts: await factsFor(tx, row.letting) };
  });
  if (!context) return;
  const { message, application, organisation, facts } = context;

  // Once the letting is closed, the AI answers nothing more: a person reads it (R26, rule 6).
  if (context.letting.status !== 'live') {
    await withOrg(input.organisationId, (tx) =>
      saveOutcome(
        tx,
        context,
        [],
        [{ question: message.body.slice(0, 1000), reason: 'letting_closed' }],
        null,
      ),
    );
    return;
  }

  // A request for a person goes straight to a person.
  if (asksForAPerson(message.body)) {
    await withOrg(input.organisationId, (tx) =>
      saveOutcome(
        tx,
        context,
        [],
        [{ question: message.body.slice(0, 1000), reason: 'asked_for_person' }],
        null,
      ),
    );
    return;
  }

  const questions = questionsIn(message.body);
  if (questions.length === 0) return;
  const fixed = questions.flatMap((question) => {
    const answer = fixedAnswerFor(question);
    return answer ? [{ question, answer }] : [];
  });
  const remaining = questions.filter((q) => !fixedAnswerFor(q));

  // 2. Ask the AI, with names and contact details removed.
  let checked: CheckedItem[] = [];
  let ai: { model: string; promptVersion: string; refused: boolean } | null = null;
  if (remaining.length > 0) {
    const drafter = aiDrafter();
    try {
      const response = await drafter.draftAnswers({
        operatorName: organisation.name,
        facts,
        questions: remaining.map((q) => redact(q, application.fullName)),
      });
      ai = {
        model: response.model,
        promptVersion: drafter.promptVersion,
        refused: Boolean(response.refused),
      };
      checked = remaining.map((question, i) => {
        const item = response.items[i];
        return item
          ? { ...checkDraftItem({ ...item, question }, facts), question }
          : { question, outcome: 'to_operator' as const, reason: 'no_facts' as const };
      });
    } catch (error) {
      console.error('AI drafting failed; the questions go to the operator', error);
      checked = remaining.map((question) => ({
        question,
        outcome: 'to_operator' as const,
        reason: 'no_facts' as const,
      }));
      ai = { model: 'unavailable', promptVersion: drafter.promptVersion, refused: false };
    }
  }

  // 3. Save the outcome in one transaction.
  const answeredByAi = checked.flatMap((c) => (c.outcome === 'answered' ? [c] : []));
  const toOperator = checked.flatMap((c) =>
    c.outcome === 'to_operator' ? [{ question: c.question, reason: c.reason }] : [],
  );
  await withOrg(input.organisationId, (tx) =>
    saveOutcome(
      tx,
      context,
      [
        ...fixed.map((f) => ({ ...f, byAi: false })),
        ...answeredByAi.map((a) => ({
          question: a.question,
          answer: a.answer,
          byAi: true,
          factIds: a.factIds,
        })),
      ],
      toOperator,
      ai,
    ),
  );
}

async function saveOutcome(
  tx: Tx,
  context: {
    message: typeof messages.$inferSelect;
    application: typeof applications.$inferSelect;
    letting: typeof lettings.$inferSelect;
    organisation: typeof organisations.$inferSelect;
    facts: Fact[];
  },
  answers: Array<{ question: string; answer: string; byAi: boolean; factIds?: string[] }>,
  toOperator: Array<{ question: string; reason: string }>,
  ai: { model: string; promptVersion: string; refused: boolean } | null,
) {
  const { message, application, letting, organisation } = context;
  const usedAi = answers.some((a) => a.byAi);
  let draftMessageId: string | null = null;
  if (answers.length > 0) {
    const { subject, body } = answersEmail({
      renterName: application.fullName,
      operatorName: organisation.name,
      address: letting.addressLine1,
      answers,
      passedToPerson: toOperator.length > 0,
    });
    // The first reply goes first; answers follow a minute later at the earliest.
    const sendAt = new Date(Date.now() + 60_000);
    draftMessageId = await queueMessage(tx, {
      organisationId: organisation.id,
      lettingId: letting.id,
      applicationId: application.id,
      kind: 'answer',
      author: usedAi ? 'ai' : 'template',
      templateKey: ANSWER_TEMPLATE,
      toAddress: application.email,
      subject,
      body,
      inReplyToId: message.id,
      sendAt,
      // R29: AI-written answers wait for a person when approve-before-send is on.
      awaitApproval: usedAi && organisation.approveBeforeSend,
    });
  }
  for (const { question, reason } of toOperator) {
    await tx.insert(operatorQuestions).values({
      organisationId: organisation.id,
      lettingId: letting.id,
      applicationId: application.id,
      sourceMessageId: message.id,
      question,
      reason,
    });
  }
  if (ai) {
    await tx.insert(aiDrafts).values({
      organisationId: organisation.id,
      sourceMessageId: message.id,
      draftMessageId,
      model: ai.model,
      promptVersion: ai.promptVersion,
      factIds: [...new Set(answers.flatMap((a) => a.factIds ?? []))],
      answered: answers.filter((a) => a.byAi).length,
      toOperator: toOperator.length,
      refused: ai.refused,
    });
  }
  await recordEvent(tx, {
    organisationId: organisation.id,
    lettingId: letting.id,
    actor: usedAi ? { type: 'ai' } : { type: 'system' },
    type: 'answers.drafted',
    subject: { type: 'message', id: message.id },
    data: {
      sourceMessageId: message.id,
      answered: answers.length,
      toOperator: toOperator.length,
      author: answers.length === 0 ? 'none' : usedAi ? 'ai' : 'template',
    },
  });
}
