import { eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { activityMinutes, lettings } from '@/db/schema';
import type { Member } from '@/server/auth/member';

/**
 * R28, Q15: records that a person was active in the workspace this minute, on a letting if
 * they were on one. Several tabs in the same minute count once.
 */
export async function recordActiveMinute(
  member: Member,
  lettingId: string | null,
  now: Date = new Date(),
): Promise<void> {
  await withOrg(member.organisationId, async (tx) => {
    const [letting] = lettingId
      ? await tx.select({ id: lettings.id }).from(lettings).where(eq(lettings.id, lettingId))
      : [];
    await tx
      .insert(activityMinutes)
      .values({
        organisationId: member.organisationId,
        userId: member.userId,
        lettingId: letting?.id ?? null,
        minute: new Date(Math.floor(now.getTime() / 60_000) * 60_000),
      })
      .onConflictDoNothing();
  });
}
