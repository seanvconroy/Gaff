import { and, eq, isNull } from 'drizzle-orm';
import { type Tx, withOrg } from '@/db/client';
import { applications, landlords, lettings } from '@/db/schema';
import { protectedGroundProblem } from '@/domain/compliance/protected-grounds';
import { CONFLICT_MESSAGE, memberAppliedIn } from '@/server/accounts/conflict';
import { assertMayActOn } from '@/server/team/permissions';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';
import { queueMessage } from './outbox';

/** The most a person can write in one message. */
export const MESSAGE_LIMIT = 5000;

/**
 * UX-NV-18: a message a person writes themselves is sent as written and marked as theirs. The
 * one check is the one every word a renter sees passes: nothing that touches a protected ground
 * goes out (rule 3). Sending is the member's own act. It decides nothing about anyone (rule 1).
 */
function written(text: string): string {
  const message = text.replace(/\r\n/g, '\n').trim();
  if (message.length < 2) throw new UserFacingError('Write your message before sending.', 'body');
  if (message.length > MESSAGE_LIMIT) {
    throw new UserFacingError('Keep your message under 5,000 characters.', 'body');
  }
  const problem = protectedGroundProblem(message);
  if (problem) throw new UserFacingError(problem, 'body');
  return message;
}

async function send(
  tx: Tx,
  member: Member,
  input: {
    lettingId: string;
    applicationId: string | null;
    address: string;
    toAddress: string;
    body: string;
  },
): Promise<string> {
  // UX-AC-14: nobody works on the letting of a home they asked about themselves.
  if (await memberAppliedIn(tx, member, input.lettingId)) {
    throw new UserFacingError(CONFLICT_MESSAGE);
  }
  // UX-AG-8: only a member who may act on the letting now writes from it.
  await assertMayActOn(tx, member, input.lettingId);
  const to = input.applicationId ? 'renter' : 'owner';
  const messageId = await queueMessage(tx, {
    organisationId: member.organisationId,
    lettingId: input.lettingId,
    applicationId: input.applicationId,
    kind: to === 'renter' ? 'message' : 'owner_message',
    author: 'person',
    authorUserId: member.userId,
    toAddress: input.toAddress,
    subject: `Re: ${input.address}`,
    body: input.body,
  });
  await recordEvent(tx, {
    organisationId: member.organisationId,
    lettingId: input.lettingId,
    actor: { type: 'person', userId: member.userId },
    type: 'message.written',
    subject: { type: 'message', id: messageId },
    data: { messageId, to },
  });
  return messageId;
}

/** A person writes to a renter, in the renter's conversation about one home. */
export async function writeToRenter(
  member: Member,
  applicationId: string,
  text: string,
): Promise<string> {
  const body = written(text);
  return withOrg(member.organisationId, async (tx) => {
    const [row] = await tx
      .select({
        lettingId: lettings.id,
        address: lettings.addressLine1,
        email: applications.email,
      })
      .from(applications)
      .innerJoin(lettings, eq(lettings.id, applications.lettingId))
      .where(and(eq(applications.id, applicationId), isNull(applications.personalDataDeletedAt)));
    if (!row) throw new UserFacingError('Gaff no longer holds this person’s details.');
    return send(tx, member, {
      lettingId: row.lettingId,
      applicationId,
      address: row.address,
      toAddress: row.email,
      body,
    });
  });
}

/** A person writes to the owner of a home they let for them. */
export async function writeToOwner(
  member: Member,
  lettingId: string,
  text: string,
): Promise<string> {
  const body = written(text);
  return withOrg(member.organisationId, async (tx) => {
    const [row] = await tx
      .select({ address: lettings.addressLine1, email: landlords.email })
      .from(lettings)
      .innerJoin(landlords, eq(landlords.id, lettings.landlordId))
      .where(eq(lettings.id, lettingId));
    if (!row) throw new UserFacingError('This home has no owner’s email address to write to.');
    return send(tx, member, {
      lettingId,
      applicationId: null,
      address: row.address,
      toAddress: row.email,
      body,
    });
  });
}
