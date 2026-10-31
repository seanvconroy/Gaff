import { and, asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { withOrg } from '@/db/client';
import { applications, lettings, messages, operatorQuestions, organisations } from '@/db/schema';
import type { Member } from '@/server/auth/member';

const source = alias(messages, 'source');

/** R29: AI-written messages waiting for a person, oldest first, with what the renter asked. */
export async function listAwaitingApproval(member: Member) {
  return withOrg(member.organisationId, (tx) =>
    tx
      .select({
        id: messages.id,
        body: messages.body,
        createdAt: messages.createdAt,
        renterName: applications.fullName,
        address: lettings.addressLine1,
        lettingId: lettings.id,
        asked: source.body,
      })
      .from(messages)
      .innerJoin(applications, eq(applications.id, messages.applicationId))
      .innerJoin(lettings, eq(lettings.id, messages.lettingId))
      .leftJoin(source, eq(source.id, messages.inReplyToId))
      .where(eq(messages.status, 'awaiting_approval'))
      .orderBy(asc(messages.createdAt)),
  );
}

/** R8: questions for a person, oldest first. */
export async function listOpenQuestions(member: Member) {
  return withOrg(member.organisationId, (tx) =>
    tx
      .select({
        id: operatorQuestions.id,
        question: operatorQuestions.question,
        reason: operatorQuestions.reason,
        createdAt: operatorQuestions.createdAt,
        renterName: applications.fullName,
        address: lettings.addressLine1,
      })
      .from(operatorQuestions)
      .innerJoin(applications, eq(applications.id, operatorQuestions.applicationId))
      .innerJoin(lettings, eq(lettings.id, operatorQuestions.lettingId))
      .where(eq(operatorQuestions.status, 'open'))
      .orderBy(asc(operatorQuestions.createdAt)),
  );
}

export async function approveBeforeSendIsOn(member: Member): Promise<boolean> {
  const [org] = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ on: organisations.approveBeforeSend })
      .from(organisations)
      .where(and(eq(organisations.id, member.organisationId))),
  );
  return org?.on ?? true;
}
