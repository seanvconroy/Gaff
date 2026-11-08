import { desc, eq } from 'drizzle-orm';
import { withSystem } from '@/db/client';
import { applications, identityChecks, users } from '@/db/schema';
import { env } from '@/lib/env';

/**
 * Development and the test copy only: which person a stand-in check belongs to, and a name to
 * suggest (their latest application's, or their account's). Stripe would know from its
 * session; the stand-in page has only the check's opaque ID.
 */
export async function standInIdentityCheck(checkId: string) {
  if (!env().DEV_TOOLS || env().IDENTITY_PROVIDER !== 'stand_in') return null;
  return withSystem(async (tx) => {
    const [row] = await tx
      .select({ userId: identityChecks.userId, status: identityChecks.status, name: users.name })
      .from(identityChecks)
      .innerJoin(users, eq(users.id, identityChecks.userId))
      .where(eq(identityChecks.id, checkId));
    if (!row) return null;
    const [application] = await tx
      .select({ fullName: applications.fullName })
      .from(applications)
      .where(eq(applications.renterUserId, row.userId))
      .orderBy(desc(applications.createdAt))
      .limit(1);
    const name = (application?.fullName || (row.name.includes('@') ? '' : row.name)).trim();
    const [first, ...rest] = name ? name.split(/\s+/) : ['Mary', 'Walsh'];
    return {
      userId: row.userId,
      status: row.status,
      suggested: { first: first ?? 'Mary', last: rest.join(' ') || 'Walsh' },
    };
  });
}
