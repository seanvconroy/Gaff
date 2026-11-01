import { and, eq, inArray } from 'drizzle-orm';
import { emailSender } from '@/adapters/email';
import { smsSender } from '@/adapters/sms';
import { withOrg, type Tx } from '@/db/client';
import { applications, messages, organisations } from '@/db/schema';
import { env } from '@/lib/env';
import { enqueue } from '@/server/jobs/enqueue';
import { recordEvent } from '@/server/record/events';

export type OutboundKind =
  | 'first_reply'
  | 'answer'
  | 'operator_answer'
  | 'holding'
  | 'invitation'
  | 'waitlisted'
  | 'booking_confirmation'
  | 'reminder'
  | 'place_offered'
  | 'letting_closed'
  | 'apply_invitation'
  | 'checks_invitation'
  | 'reference_request'
  | 'reference_reminder';

/**
 * Puts a message in the outbox (ADR-0010), in the caller's transaction. AI-written answers
 * wait for approval when approve-before-send is on (R29); fixed templates and a person's own
 * words are scheduled straight away.
 */
export async function queueMessage(
  tx: Tx,
  input: {
    organisationId: string;
    lettingId: string;
    applicationId: string;
    kind: OutboundKind;
    author: 'template' | 'ai' | 'person';
    authorUserId?: string;
    templateKey?: string;
    toAddress: string;
    subject: string;
    body: string;
    inReplyToId?: string;
    sendAt?: Date;
    awaitApproval?: boolean;
    channel?: 'email' | 'sms';
    bookingId?: string;
    /** R18: the check a reference request or reminder belongs to. */
    checkId?: string;
  },
): Promise<string> {
  if (input.author === 'ai' && input.kind !== 'answer') {
    // CLAUDE.md rule 7: the AI writes only answers; everything else is a fixed template.
    throw new Error('The AI may only write answers to renters’ questions');
  }
  const sendAt = input.sendAt ?? new Date();
  const status = input.awaitApproval ? 'awaiting_approval' : 'scheduled';
  const [message] = await tx
    .insert(messages)
    .values({
      organisationId: input.organisationId,
      lettingId: input.lettingId,
      applicationId: input.applicationId,
      direction: 'outbound',
      channel: input.channel ?? 'email',
      bookingId: input.bookingId ?? null,
      checkId: input.checkId ?? null,
      kind: input.kind,
      templateKey: input.templateKey ?? null,
      author: input.author,
      authorUserId: input.authorUserId ?? null,
      toAddress: input.toAddress,
      subject: input.subject,
      body: input.body,
      status,
      sendAt,
      inReplyToId: input.inReplyToId ?? null,
    })
    .returning({ id: messages.id });
  if (status === 'scheduled') {
    await enqueue(
      tx,
      'send_message',
      { organisationId: input.organisationId, messageId: message!.id },
      { runAt: sendAt, jobKey: `send:${message!.id}` },
    );
  }
  return message!.id;
}

/** Schedules a message a person has approved (R29). */
export async function scheduleApproved(tx: Tx, organisationId: string, messageId: string) {
  await enqueue(tx, 'send_message', { organisationId, messageId }, { jobKey: `send:${messageId}` });
}

/**
 * The outbox dispatcher (runs in the worker). Sends a scheduled message once; a provider
 * failure is retried with backoff, and the last failure is shown to the operator.
 */
export async function sendMessage(input: {
  organisationId: string;
  messageId: string;
  attempt: number;
  maxAttempts: number;
}): Promise<'sent' | 'skipped'> {
  const claimed = await withOrg(input.organisationId, async (tx) => {
    const [row] = await tx
      .select({
        message: messages,
        ref: applications.ref,
        operatorName: organisations.name,
        slug: organisations.inboundSlug,
      })
      .from(messages)
      .innerJoin(applications, eq(applications.id, messages.applicationId))
      .innerJoin(organisations, eq(organisations.id, messages.organisationId))
      .where(and(eq(messages.id, input.messageId), eq(messages.status, 'scheduled')))
      .for('update', { of: messages });
    if (!row) return null;
    await tx.update(messages).set({ status: 'sending' }).where(eq(messages.id, input.messageId));
    return row;
  });
  if (!claimed) return 'skipped';

  const { message, ref, operatorName, slug } = claimed;
  const config = env();
  try {
    const { providerMessageId } =
      message.channel === 'sms'
        ? await smsSender().send({ to: message.toAddress!, body: message.body })
        : await emailSender().send({
            to: message.toAddress!,
            from: {
              name: `${operatorName} via Gaff`,
              address: `${slug}@${config.MAIL_FROM_DOMAIN}`,
            },
            replyTo: `${slug}+${ref}@${config.INBOUND_DOMAIN}`,
            subject: message.subject ?? '',
            text: message.body,
          });
    await withOrg(input.organisationId, async (tx) => {
      await tx
        .update(messages)
        .set({ status: 'sent', sentAt: new Date(), providerMessageId, failure: null })
        .where(eq(messages.id, message.id));
      await recordEvent(tx, {
        organisationId: input.organisationId,
        lettingId: message.lettingId,
        actor:
          message.author === 'person'
            ? { type: 'person', userId: message.authorUserId! }
            : message.author === 'ai'
              ? { type: 'ai' }
              : { type: 'system' },
        type: 'message.sent',
        subject: { type: 'message', id: message.id },
        data: {
          messageId: message.id,
          kind: message.kind as OutboundKind,
          channel: message.channel,
          author: message.author as 'template' | 'ai' | 'person',
        },
      });
    });
    return 'sent';
  } catch (error) {
    const lastTry = input.attempt >= input.maxAttempts;
    await withOrg(input.organisationId, async (tx) => {
      await tx
        .update(messages)
        .set({
          status: lastTry ? 'failed' : 'scheduled',
          failure: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error',
        })
        .where(eq(messages.id, message.id));
      if (lastTry) {
        await recordEvent(tx, {
          organisationId: input.organisationId,
          lettingId: message.lettingId,
          actor: { type: 'system' },
          type: 'message.failed',
          subject: { type: 'message', id: message.id },
          data: { messageId: message.id, attempts: input.attempt },
        });
      }
    });
    throw error;
  }
}

/** Cancels a booking's confirmation and reminders that haven't gone yet (R13). */
export async function cancelBookingMessages(tx: Tx, bookingId: string): Promise<void> {
  await tx
    .update(messages)
    .set({ status: 'cancelled' })
    .where(
      and(
        eq(messages.bookingId, bookingId),
        inArray(messages.status, ['scheduled', 'awaiting_approval']),
      ),
    );
}
