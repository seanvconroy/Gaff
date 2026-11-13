import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { withEnquiry, withRenter } from '@/db/client';
import { applications, messages, profileShares, renterEnquiries } from '@/db/schema';
import { needsAnswers, queueDraft } from '@/server/answers/draft';
import { createAccessLink } from '@/server/access/links';
import { recordEvent } from '@/server/record/events';
import type { Renter } from '@/server/enquiries/marketplace';

/**
 * M79, M80, M12: a signed-in renter's homes, read from their own zone and, through the
 * renter_read policies, from their own applications and messages only (ADR-0017). Renter
 * queries name their columns: a renter never reads the letter's internal ones.
 */

export async function myHomes(userId: string) {
  return withRenter(userId, (tx) =>
    tx
      .select({
        applicationId: renterEnquiries.applicationId,
        title: renterEnquiries.title,
        addressShown: renterEnquiries.addressShown,
        slug: renterEnquiries.slug,
        letterName: renterEnquiries.letterName,
        enquiredAt: renterEnquiries.enquiredAt,
        withdrawnAt: renterEnquiries.withdrawnAt,
        status: applications.status,
        deletedAt: applications.personalDataDeletedAt,
      })
      .from(renterEnquiries)
      .leftJoin(applications, eq(applications.id, renterEnquiries.applicationId))
      .orderBy(desc(renterEnquiries.enquiredAt)),
  );
}

export type MyHome = Awaited<ReturnType<typeof myHomes>>[number];

/** M79, M80: one home: where it's at, and the messages, oldest first. */
export async function myHome(userId: string, applicationId: string) {
  return withRenter(userId, async (tx) => {
    const [home] = await tx
      .select({
        applicationId: renterEnquiries.applicationId,
        organisationId: renterEnquiries.organisationId,
        title: renterEnquiries.title,
        addressShown: renterEnquiries.addressShown,
        slug: renterEnquiries.slug,
        letterName: renterEnquiries.letterName,
        enquiredAt: renterEnquiries.enquiredAt,
        withdrawnAt: renterEnquiries.withdrawnAt,
        status: applications.status,
        deleteAfter: applications.deleteAfter,
        deletedAt: applications.personalDataDeletedAt,
      })
      .from(renterEnquiries)
      .leftJoin(applications, eq(applications.id, renterEnquiries.applicationId))
      .where(eq(renterEnquiries.applicationId, applicationId));
    if (!home) return null;
    const thread = await tx
      .select({
        id: messages.id,
        direction: messages.direction,
        author: messages.author,
        subject: messages.subject,
        body: messages.body,
        at: messages.createdAt,
        sentAt: messages.sentAt,
      })
      .from(messages)
      .where(eq(messages.applicationId, applicationId))
      .orderBy(asc(messages.createdAt));
    return { ...home, thread };
  });
}

/**
 * M79: the renter's page for this home (R9 onwards: answers, booking, application, offer and
 * tenancy) is the private-link page. A signed-in renter gets a fresh link to it on demand.
 */
export async function renterPageLink(
  renter: Renter,
  applicationId: string,
): Promise<string | null> {
  const [mine] = await withRenter(renter.userId, (tx) =>
    tx
      .select({ organisationId: renterEnquiries.organisationId })
      .from(renterEnquiries)
      .where(eq(renterEnquiries.applicationId, applicationId)),
  );
  if (!mine) return null;
  return withEnquiry(mine.organisationId, renter.userId, async (tx) => {
    const [application] = await tx
      .select({ id: applications.id })
      .from(applications)
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.renterUserId, renter.userId),
          isNull(applications.personalDataDeletedAt),
        ),
      );
    if (!application) return null;
    const token = await createAccessLink(tx, {
      organisationId: mine.organisationId,
      purpose: 'renter',
      subjectId: application.id,
    });
    return `/r/${token}`;
  });
}

/**
 * M80: a renter writes to the letter in Gaff. It joins the thread like an emailed reply, and
 * questions are answered from the facts, or go to a person (R8).
 */
export async function sendMessageInApp(
  renter: Renter,
  applicationId: string,
  text: string,
): Promise<'sent' | 'not_found' | 'empty'> {
  const body = text.trim().slice(0, 5000);
  if (!body) return 'empty';
  const [mine] = await withRenter(renter.userId, (tx) =>
    tx
      .select({ organisationId: renterEnquiries.organisationId, title: renterEnquiries.title })
      .from(renterEnquiries)
      .where(eq(renterEnquiries.applicationId, applicationId)),
  );
  if (!mine) return 'not_found';
  return withEnquiry(mine.organisationId, renter.userId, async (tx) => {
    const [application] = await tx
      .select({ id: applications.id, lettingId: applications.lettingId })
      .from(applications)
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.renterUserId, renter.userId),
          isNull(applications.personalDataDeletedAt),
        ),
      );
    if (!application) return 'not_found';
    const [message] = await tx
      .insert(messages)
      .values({
        organisationId: mine.organisationId,
        lettingId: application.lettingId,
        applicationId,
        direction: 'inbound',
        channel: 'app',
        kind: 'reply',
        author: 'renter',
        subject: `About ${mine.title}`,
        body,
        status: 'received',
      })
      .returning({ id: messages.id });
    await recordEvent(tx, {
      organisationId: mine.organisationId,
      lettingId: application.lettingId,
      actor: { type: 'renter', applicationId },
      type: 'reply.received',
      subject: { type: 'message', id: message!.id },
      data: { applicationId, messageId: message!.id },
    });
    if (needsAnswers(body)) await queueDraft(tx, mine.organisationId, message!.id);
    return 'sent';
  });
}

/** M12: "Who has my details": for each letter, what they have, since when, and until when. */
export async function whoHasMyDetails(userId: string) {
  const rows = await withRenter(userId, (tx) =>
    tx
      .select({
        applicationId: profileShares.applicationId,
        dataGroup: profileShares.dataGroup,
        sharedAt: profileShares.sharedAt,
        letterName: renterEnquiries.letterName,
        title: renterEnquiries.title,
        deleteAfter: applications.deleteAfter,
        deletedAt: applications.personalDataDeletedAt,
      })
      .from(profileShares)
      .innerJoin(renterEnquiries, eq(renterEnquiries.applicationId, profileShares.applicationId))
      .leftJoin(applications, eq(applications.id, profileShares.applicationId))
      .orderBy(desc(profileShares.sharedAt)),
  );
  const byApplication = new Map<
    string,
    {
      letterName: string;
      title: string;
      since: Date;
      deleteAfter: string | null;
      deleted: boolean;
      groups: string[];
    }
  >();
  for (const row of rows) {
    const entry = byApplication.get(row.applicationId) ?? {
      letterName: row.letterName,
      title: row.title,
      since: row.sharedAt,
      deleteAfter: row.deleteAfter,
      deleted: row.deletedAt !== null,
      groups: [],
    };
    entry.groups.push(row.dataGroup);
    if (row.sharedAt < entry.since) entry.since = row.sharedAt;
    byApplication.set(row.applicationId, entry);
  }
  return [...byApplication.entries()].map(([applicationId, entry]) => ({
    applicationId,
    ...entry,
  }));
}
