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
 * R7: queues the first reply to a new enquiry, once per application, only for a live letting
 * that isn't hidden (UX-TS-4).
 * It goes out within minutes whether or not approve-before-send is on (open question Q1).
 */
export async function queueFirstReply(
  tx: Tx,
  organisationId: string,
  applicationId: string,
  options: { withLink?: boolean } = {},
): Promise<boolean> {
  const [row] = await tx
    .select({ application: applications, letting: lettings, organisation: organisations })
    .from(applications)
    .innerJoin(lettings, eq(lettings.id, applications.lettingId))
    .innerJoin(organisations, eq(organisations.id, applications.organisationId))
    .where(eq(applications.id, applicationId));
  // UX-TS-4: a home Gaff's team has hidden waits too: its first replies go when it's back.
  // M49: so does one that stepped back, unconfirmed, until its lister says it's still available.
  if (!row || row.letting.status !== 'live' || row.letting.hiddenAt || row.letting.staleAt) {
    return false;
  }
  const { application, letting, organisation } = row;

  const [already] = await tx
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.applicationId, applicationId), eq(messages.kind, 'first_reply')))
    .limit(1);
  if (already) return false;

  const needsAnswers = questionsFor(letting.criteria ?? { noPets: false }).length > 0;
  // UX-AV-7: an enquiry made on Gaff always has its link, to the same page a Daft enquiry's opens.
  const token =
    needsAnswers || options.withLink
      ? await createAccessLink(tx, { organisationId, purpose: 'renter', subjectId: applicationId })
      : null;
  const { subject, body } = await writeFirstReply(tx, {
    letting,
    organisation,
    renterName: application.fullName,
    token,
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

/**
 * R7, UX-AV-7: the first reply's words, the fixed template filled in for one renter and one home.
 * The one place they're written, for an enquiry from Daft or MyHome and one made on Gaff alike.
 */
export async function writeFirstReply(
  tx: Tx,
  input: {
    letting: typeof lettings.$inferSelect;
    organisation: typeof organisations.$inferSelect;
    renterName: string;
    /** The renter's private link token, if the reply carries one. */
    token: string | null;
  },
): Promise<{ subject: string; body: string }> {
  const appUrl = env().APP_URL;
  const { letting, organisation } = input;
  const [firstSlot] = await tx
    .select({ startsAt: viewingSlots.startsAt })
    .from(viewingSlots)
    .where(eq(viewingSlots.lettingId, letting.id))
    .orderBy(asc(viewingSlots.startsAt))
    .limit(1);
  return firstReply({
    renterName: input.renterName,
    operatorName: organisation.name,
    address: letting.addressLine1,
    area: letting.area,
    rentCents: letting.monthlyRentCents,
    availableFrom: letting.availableFrom,
    questionsUrl: input.token ? `${appUrl}/r/${input.token}` : null,
    firstViewing: firstSlot?.startsAt ?? null,
    privacyUrl: `${appUrl}/privacy/${organisation.inboundSlug}`,
  });
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
