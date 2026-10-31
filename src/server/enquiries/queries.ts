import { and, asc, desc, eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { applications, inboundEmails, lettings } from '@/db/schema';
import type { Member } from '@/server/auth/member';

/** R6: everyone who has enquired about a letting, earliest first. */
export async function listApplications(member: Member, lettingId: string) {
  return withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(applications)
      .where(eq(applications.lettingId, lettingId))
      .orderBy(asc(applications.firstEnquiredAt)),
  );
}

/** Emails Gaff couldn't place: the operator decides what they are. Nothing is dropped. */
export async function listNeedsAttention(member: Member) {
  return withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(inboundEmails)
      .where(eq(inboundEmails.status, 'needs_attention'))
      .orderBy(desc(inboundEmails.receivedAt)),
  );
}

export async function countNeedsAttention(member: Member): Promise<number> {
  return (await listNeedsAttention(member)).length;
}

export async function lettingsToAssign(member: Member) {
  return withOrg(member.organisationId, (tx) =>
    tx
      .select({ id: lettings.id, addressLine1: lettings.addressLine1 })
      .from(lettings)
      .where(and(eq(lettings.status, 'live')))
      .orderBy(asc(lettings.addressLine1)),
  );
}
