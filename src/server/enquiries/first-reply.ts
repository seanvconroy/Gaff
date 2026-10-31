import { and, asc, eq } from 'drizzle-orm';
import type { Tx } from '@/db/client';
import { applications, lettings, messages, organisations, viewingSlots } from '@/db/schema';
import { FIRST_REPLY_TEMPLATE, firstReply } from '@/copy/templates/first-reply';
import { questionsFor } from '@/domain/criteria/criteria';
import { env } from '@/lib/env';
import { createAccessLink } from '@/server/access/links';
import { needsAnswers, queueDraft } from '@/server/answers/draft';
import { queueMessage } from '@/server/messages/outbox';

/**
 * R7: queues the first reply to a new enquiry, once per application, only for a live letting.
 * It goes out within minutes whether or not approve-before-send is on (open question Q1).
 */
export async function queueFirstReply(
  tx: Tx,
  organisationId: string,
  applicationId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ application: applications, letting: lettings, organisation: organisations })
    .from(applications)
    .innerJoin(lettings, eq(lettings.id, applications.lettingId))
    .innerJoin(organisations, eq(organisations.id, applications.organisationId))
    .where(eq(applications.id, applicationId));
  if (!row || row.letting.status !== 'live') return false;
  const { application, letting, organisation } = row;

  const [already] = await tx
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.applicationId, applicationId), eq(messages.kind, 'first_reply')))
    .limit(1);
  if (already) return false;

  const appUrl = env().APP_URL;
  const needsAnswers = questionsFor(letting.criteria ?? { noPets: false }).length > 0;
  const token = needsAnswers
    ? await createAccessLink(tx, { organisationId, purpose: 'renter', subjectId: applicationId })
    : null;
  const [firstSlot] = await tx
    .select({ startsAt: viewingSlots.startsAt })
    .from(viewingSlots)
    .where(eq(viewingSlots.lettingId, letting.id))
    .orderBy(asc(viewingSlots.startsAt))
    .limit(1);

  const { subject, body } = firstReply({
    renterName: application.fullName,
    operatorName: organisation.name,
    address: letting.addressLine1,
    area: letting.area,
    rentCents: letting.monthlyRentCents,
    availableFrom: letting.availableFrom,
    questionsUrl: token ? `${appUrl}/r/${token}` : null,
    firstViewing: firstSlot?.startsAt ?? null,
    privacyUrl: `${appUrl}/privacy/${organisation.inboundSlug}`,
  });
  await queueMessage(tx, {
    organisationId,
    lettingId: letting.id,
    applicationId,
    kind: 'first_reply',
    author: 'template',
    templateKey: FIRST_REPLY_TEMPLATE,
    toAddress: application.email,
    subject,
    body,
  });
  return true;
}

/** When a letting goes live, everyone who enquired during set-up gets their first reply. */
export async function queueWaitingFirstReplies(
  tx: Tx,
  organisationId: string,
  lettingId: string,
): Promise<number> {
  const waiting = await tx
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.lettingId, lettingId))
    .orderBy(asc(applications.firstEnquiredAt));
  let queued = 0;
  for (const application of waiting) {
    if (await queueFirstReply(tx, organisationId, application.id)) queued += 1;
  }
  // R8: questions asked during set-up are answered now too.
  const asked = await tx
    .select({ id: messages.id, body: messages.body })
    .from(messages)
    .where(and(eq(messages.lettingId, lettingId), eq(messages.direction, 'inbound')));
  for (const message of asked) {
    if (needsAnswers(message.body)) await queueDraft(tx, organisationId, message.id);
  }
  return queued;
}
