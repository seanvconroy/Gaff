import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { type Tx, withOrg } from '@/db/client';
import {
  applications,
  inboundEmails,
  landlords,
  lettings,
  memberships,
  messages,
  operatorQuestions,
  organisations,
  users,
} from '@/db/schema';
import { draftParts } from '@/copy/templates/answers';
import { firstNameOf } from '@/domain/accounts/first-run';
import {
  type ForwardingConfirmation,
  readForwardingConfirmation,
} from '@/domain/enquiries/forwarding-confirmation';
import {
  type Conversation,
  type ConversationRef,
  conversationKey,
  conversationsFrom,
  type InboxMessage,
  type Readers,
  senderName,
} from '@/domain/inbox/conversations';
import { type Reply, replyFor, threadFrom, type ThreadEntry } from '@/domain/inbox/thread';
import { leadOf } from '@/domain/lettings/lead';
import { normaliseEmail } from '@/domain/enquiries/parse';
import { env } from '@/lib/env';
import type { Member } from '@/server/auth/member';

/** The most conversations the list shows. Search and paging come once pilots need them. */
export const LIST_LIMIT = 200;

const messageColumns = {
  id: messages.id,
  lettingId: messages.lettingId,
  applicationId: messages.applicationId,
  checkId: messages.checkId,
  direction: messages.direction,
  author: messages.author,
  authorUserId: messages.authorUserId,
  channel: messages.channel,
  status: messages.status,
  body: messages.body,
  createdAt: messages.createdAt,
  sendAt: messages.sendAt,
  sentAt: messages.sentAt,
};

/** A message that was said (`isSaid` in the domain), as a condition the database can apply. */
const said = (now: Date) =>
  or(
    inArray(messages.status, ['received', 'sent', 'sending', 'failed']),
    and(eq(messages.status, 'scheduled'), or(isNull(messages.sendAt), lte(messages.sendAt, now))),
  );

const saidAt = sql`coalesce(${messages.sentAt}, ${messages.createdAt})`;

/** The people on the team, and who is reading. */
async function readersFor(tx: Tx, member: Member): Promise<Readers & { memberIds: Set<string> }> {
  const team = await tx
    .select({ userId: users.id, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organisationId, member.organisationId));
  return {
    viewerUserId: member.userId,
    names: new Map(team.map((m) => [m.userId, m.name])),
    appUrl: env().APP_URL,
    memberIds: new Set(team.map((m) => m.userId)),
  };
}

/**
 * UX-AC-14 (rule 1): the homes this member asked about themselves, as a renter. Their letting
 * is someone else's to run, so none of their conversations show for this member.
 */
async function ownEnquiries(tx: Tx, member: Member): Promise<Set<string>> {
  if (!member.emailVerified) return new Set();
  const rows = await tx
    .select({ lettingId: applications.lettingId })
    .from(applications)
    .where(eq(applications.emailNormalised, normaliseEmail(member.email)));
  return new Set(rows.map((row) => row.lettingId));
}

/**
 * UX-NV-13: every conversation in the organisation, newest first, for this member: which need
 * them, and who leads each home. Read from what is already stored, inside `withOrg`, so
 * row-level security holds it to the member's own organisation.
 */
export async function inboxFor(
  member: Member,
  now: Date = new Date(),
): Promise<{ conversations: Conversation[]; leads: Map<string, string> }> {
  return withOrg(member.organisationId, async (tx) => {
    const readers = await readersFor(tx, member);
    const own = await ownEnquiries(tx, member);

    const homeRows = await tx
      .select({
        lettingId: lettings.id,
        address: lettings.addressLine1,
        createdBy: lettings.createdBy,
        ownerName: landlords.name,
      })
      .from(lettings)
      .leftJoin(landlords, eq(landlords.id, lettings.landlordId));
    const homes = homeRows
      .filter((home) => !own.has(home.lettingId))
      .map((home) => {
        const lead = leadOf(home);
        return {
          lettingId: home.lettingId,
          address: home.address,
          // A home whose lead has left the team is nobody's, so it shows for everyone.
          leadUserId: readers.memberIds.has(lead) ? lead : null,
          ownerName: home.ownerName,
        };
      });

    // The last thing said in each renter's conversation, and in each owner's.
    const lastToRenters = await tx
      .selectDistinctOn([messages.applicationId], messageColumns)
      .from(messages)
      .where(and(isNotNull(messages.applicationId), isNull(messages.checkId), said(now)))
      .orderBy(messages.applicationId, desc(saidAt), desc(messages.id));
    const lastToOwners = await tx
      .selectDistinctOn([messages.lettingId], messageColumns)
      .from(messages)
      .where(and(isNull(messages.applicationId), isNull(messages.checkId), said(now)))
      .orderBy(messages.lettingId, desc(saidAt), desc(messages.id));

    // R29: drafts waiting for a person. R8: questions only a person can answer.
    const drafts = await tx
      .select({ applicationId: messages.applicationId, since: messages.createdAt })
      .from(messages)
      .where(and(eq(messages.status, 'awaiting_approval'), isNotNull(messages.applicationId)));
    const questions = await tx
      .select({
        applicationId: operatorQuestions.applicationId,
        since: operatorQuestions.createdAt,
      })
      .from(operatorQuestions)
      .where(eq(operatorQuestions.status, 'open'));
    const emails = await tx
      .select({
        id: inboundEmails.id,
        from: inboundEmails.fromAddress,
        subject: inboundEmails.subject,
        receivedAt: inboundEmails.receivedAt,
      })
      .from(inboundEmails)
      .where(eq(inboundEmails.status, 'needs_attention'));

    const waiting = [...drafts, ...questions].flatMap((w) =>
      w.applicationId ? [{ applicationId: w.applicationId, since: w.since }] : [],
    );
    const applicationIds = [
      ...new Set([
        ...lastToRenters.flatMap((m) => (m.applicationId ? [m.applicationId] : [])),
        ...waiting.map((w) => w.applicationId),
      ]),
    ];
    // Someone whose details were deleted has no conversation: their messages are empty.
    const renters =
      applicationIds.length === 0
        ? []
        : await tx
            .select({
              applicationId: applications.id,
              lettingId: applications.lettingId,
              fullName: applications.fullName,
            })
            .from(applications)
            .where(
              and(
                inArray(applications.id, applicationIds),
                isNull(applications.personalDataDeletedAt),
              ),
            );

    const conversations = conversationsFrom({
      messages: [...lastToRenters, ...lastToOwners] as InboxMessage[],
      drafts: drafts.flatMap((d) =>
        d.applicationId ? [{ applicationId: d.applicationId, since: d.since }] : [],
      ),
      questions,
      emails,
      renters,
      homes,
      readers,
      now,
    });
    return {
      // Whatever needs this person is always in the list, however long the list is.
      conversations: [
        ...conversations.filter((c) => c.needsYou),
        ...conversations.filter((c) => !c.needsYou).slice(0, LIST_LIMIT),
      ].sort((a, b) => b.at.getTime() - a.at.getTime() || a.key.localeCompare(b.key)),
      leads: readers.names,
    };
  });
}

interface ThreadBase {
  key: string;
  /** Who it is with, in full: the heading of the open conversation. */
  name: string;
  firstName: string;
  entries: ThreadEntry[];
}

export interface RenterThread extends ThreadBase {
  kind: 'renter';
  applicationId: string;
  home: { lettingId: string; address: string };
  reply: Reply;
  /** Where a waiting draft says a person will answer the rest (UX-NV-15), if it does. */
  draftParts: { before: string; after: string } | null;
}

export interface OwnerThread extends ThreadBase {
  kind: 'owner';
  home: { lettingId: string; address: string };
  /** Whether there is an address to write to. */
  canWrite: boolean;
}

export interface EmailThread extends ThreadBase {
  kind: 'email';
  emailId: string;
  subject: string;
  problem: string | null;
  /** UX-NV-17: the code or link, where it is a forwarding confirmation from Gmail or Outlook. */
  confirmation: ForwardingConfirmation | null;
  /** The homes it could be about: the ones taking enquiries, where Gaff can read an enquiry. */
  homes: Array<{ lettingId: string; address: string }>;
}

export type OpenThread = RenterThread | OwnerThread | EmailThread;

/**
 * UX-NV-14: one conversation, open. Null when there is no such conversation for this member:
 * another organisation's (row-level security returns nothing), a renter whose details were
 * deleted, an email already dealt with, or a home the member asked about themselves.
 */
export async function threadFor(
  member: Member,
  ref: ConversationRef,
  now: Date = new Date(),
): Promise<OpenThread | null> {
  return withOrg(member.organisationId, async (tx) => {
    const key = conversationKey(ref);
    const readers = await readersFor(tx, member);
    const own = await ownEnquiries(tx, member);

    if (ref.kind === 'email') {
      const [email] = await tx
        .select()
        .from(inboundEmails)
        .where(and(eq(inboundEmails.id, ref.id), eq(inboundEmails.status, 'needs_attention')));
      if (!email) return null;
      const name = senderName(email.fromAddress);
      // Only an email Gaff can read as an enquiry can be matched to a home (R6).
      const homes =
        email.problem === 'no_matching_letting'
          ? (
              await tx
                .select({ lettingId: lettings.id, address: lettings.addressLine1 })
                .from(lettings)
                .where(eq(lettings.status, 'live'))
                .orderBy(asc(lettings.addressLine1))
            ).filter((home) => !own.has(home.lettingId))
          : [];
      return {
        kind: 'email',
        key,
        emailId: email.id,
        name,
        firstName: name,
        subject: email.subject,
        problem: email.problem,
        confirmation: readForwardingConfirmation({
          from: email.fromAddress,
          subject: email.subject,
          text: email.text,
        }),
        homes,
        entries: [
          {
            id: email.id,
            from: 'them',
            name,
            at: email.receivedAt,
            state: 'said',
            text: email.text.trim(),
            byText: false,
          },
        ],
      };
    }

    if (ref.kind === 'owner') {
      const [home] = await tx
        .select({
          lettingId: lettings.id,
          address: lettings.addressLine1,
          ownerName: landlords.name,
          ownerEmail: landlords.email,
        })
        .from(lettings)
        .leftJoin(landlords, eq(landlords.id, lettings.landlordId))
        .where(eq(lettings.id, ref.id));
      if (!home || own.has(home.lettingId)) return null;
      const said = (await tx
        .select(messageColumns)
        .from(messages)
        .where(
          and(
            eq(messages.lettingId, ref.id),
            isNull(messages.applicationId),
            isNull(messages.checkId),
          ),
        )
        .orderBy(asc(messages.createdAt))) as InboxMessage[];
      // An owner has a conversation once something has been sent to them, or can be.
      if (said.length === 0 && !home.ownerEmail) return null;
      const name = home.ownerName ?? 'The owner';
      const firstName = home.ownerName ? firstNameOf(home.ownerName) : 'the owner';
      return {
        kind: 'owner',
        key,
        name,
        firstName,
        home: { lettingId: home.lettingId, address: home.address },
        canWrite: Boolean(home.ownerEmail),
        entries: threadFrom(said, { readers, theirName: firstName, now }),
      };
    }

    const [row] = await tx
      .select({
        applicationId: applications.id,
        fullName: applications.fullName,
        lettingId: lettings.id,
        address: lettings.addressLine1,
        operatorName: organisations.name,
      })
      .from(applications)
      .innerJoin(lettings, eq(lettings.id, applications.lettingId))
      .innerJoin(organisations, eq(organisations.id, applications.organisationId))
      .where(and(eq(applications.id, ref.id), isNull(applications.personalDataDeletedAt)));
    if (!row || own.has(row.lettingId)) return null;
    const all = (await tx
      .select(messageColumns)
      .from(messages)
      .where(and(eq(messages.applicationId, ref.id), isNull(messages.checkId)))
      .orderBy(asc(messages.createdAt))) as InboxMessage[];
    const open = await tx
      .select({
        id: operatorQuestions.id,
        question: operatorQuestions.question,
        reason: operatorQuestions.reason,
        createdAt: operatorQuestions.createdAt,
      })
      .from(operatorQuestions)
      .where(
        and(eq(operatorQuestions.applicationId, ref.id), eq(operatorQuestions.status, 'open')),
      );
    const firstName = firstNameOf(row.fullName) || 'them';
    const reply = replyFor(
      all.filter((message) => message.status === 'awaiting_approval'),
      open,
    );
    const parts = reply.kind === 'draft' ? draftParts(reply.draft.body, row.operatorName) : null;
    return {
      kind: 'renter',
      key,
      applicationId: row.applicationId,
      name: row.fullName,
      firstName,
      home: { lettingId: row.lettingId, address: row.address },
      reply,
      draftParts: parts ? { before: parts.before, after: parts.after } : null,
      entries: threadFrom(all, { readers, theirName: firstName, now }),
    };
  });
}
