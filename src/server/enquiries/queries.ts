import { asc, eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { applications } from '@/db/schema';
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
