import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { organisations } from '@/db/schema';
import { requireMember } from '@/server/auth/member';

/** Settings belong to the organisation the member lets for (UX-ST-1). */
export async function loadSettings() {
  const member = await requireMember();
  const [organisation] = await db()
    .select()
    .from(organisations)
    .where(eq(organisations.id, member.organisationId));
  return { member, organisation: organisation! };
}
