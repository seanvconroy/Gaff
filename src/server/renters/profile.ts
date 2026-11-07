import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { withRenter } from '@/db/client';
import { renterProfiles } from '@/db/schema';
import { recordPlatformEvent } from '@/server/record/platform-events';

export const givenNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter your first name')
  .max(60, 'Keep your first name under 60 characters');

/**
 * M1, M8: someone chooses to rent with Gaff. Their profile holds only their first name for now;
 * the rest comes when they enquire, and is kept only if they tick "Keep my details" (Q25).
 */
export async function startRenting(userId: string, givenName: string): Promise<void> {
  const name = givenNameSchema.parse(givenName);
  await withRenter(userId, async (tx) => {
    const [existing] = await tx
      .select({ userId: renterProfiles.userId })
      .from(renterProfiles)
      .where(eq(renterProfiles.userId, userId));
    if (existing) return;
    await tx.insert(renterProfiles).values({ userId, givenName: name });
    await recordPlatformEvent(tx, {
      type: 'renter.profile_created',
      actor: { type: 'person', userId },
      data: { keepDetails: false },
    });
  });
}

export async function renterProfile(userId: string) {
  const [row] = await withRenter(userId, (tx) =>
    tx.select().from(renterProfiles).where(eq(renterProfiles.userId, userId)),
  );
  return row ?? null;
}
