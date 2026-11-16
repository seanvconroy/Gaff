import { eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { organisations } from '@/db/schema';
import type { Member } from '@/server/auth/member';

/** R29: whether AI-written answers wait for a person before they go. */
export async function approveBeforeSendIsOn(member: Member): Promise<boolean> {
  const [org] = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ on: organisations.approveBeforeSend })
      .from(organisations)
      .where(eq(organisations.id, member.organisationId)),
  );
  return org?.on ?? true;
}
