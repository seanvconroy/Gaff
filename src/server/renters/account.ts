import { eq, like, or } from 'drizzle-orm';
import { db, withRenter, withSystem } from '@/db/client';
import {
  alertDeliveries,
  applications,
  memberships,
  profileShares,
  renterEnquiries,
  renterProfiles,
  savedHomes,
  savedSearches,
  staffMembers,
  users,
  verifications,
} from '@/db/schema';
import { recordPlatformEvent } from '@/server/record/platform-events';
import { whoHasMyDetails } from './homes';

/**
 * M13: a renter's own data, all of it, as one file: their account and profile, the homes they
 * enquired about and what each letter has, saved homes and notes, and saved searches. The
 * letters' copies are theirs to keep until their own deletion dates; the file says who has
 * what, and until when.
 */
export async function myData(userId: string, now = new Date()) {
  const [account] = await db()
    .select({ name: users.name, email: users.email, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId));
  const renterZone = await withRenter(userId, async (tx) => ({
    profile: (await tx.select().from(renterProfiles))[0] ?? null,
    homesEnquiredAbout: await tx.select().from(renterEnquiries),
    sharedWithLetters: await tx.select().from(profileShares),
    savedHomes: await tx.select().from(savedHomes),
    savedSearches: await tx.select().from(savedSearches),
    alertsSent: await tx.select().from(alertDeliveries),
    // What letters hold from the renter's enquiries, as the renter gave it.
    applications: await tx
      .select({
        id: applications.id,
        fullName: applications.fullName,
        email: applications.email,
        phone: applications.phone,
        answers: applications.answers,
        status: applications.status,
        firstEnquiredAt: applications.firstEnquiredAt,
        deleteAfter: applications.deleteAfter,
      })
      .from(applications),
  }));
  return {
    downloadedAt: now.toISOString(),
    about:
      'Everything Gaff holds about you as a renter. Letters keep their own copies of what you sent them until the dates in "whoHasYourDetails".',
    account,
    ...renterZone,
    whoHasYourDetails: await whoHasMyDetails(userId),
  };
}

export type DeleteResult = 'deleted' | 'is_a_letter';

/**
 * M13: a renter deletes their account themselves. Their profile, saved homes, searches, alerts
 * and record of who has their details go at once. The letters they enquired with keep their
 * copies until their own deletion dates, no longer linked to any account.
 */
export async function deleteRenterAccount(userId: string): Promise<DeleteResult> {
  const [member] = await db()
    .select({ id: memberships.organisationId })
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .limit(1);
  const [staff] = await db()
    .select({ id: staffMembers.userId })
    .from(staffMembers)
    .where(eq(staffMembers.userId, userId));
  if (member || staff) return 'is_a_letter';
  await withSystem(async (tx) => {
    const [user] = await tx.select({ email: users.email }).from(users).where(eq(users.id, userId));
    await tx
      .update(applications)
      .set({ renterUserId: null })
      .where(eq(applications.renterUserId, userId));
    // Unused sign-in links and codes for the address (codes are kept as "sign-in-otp-<email>").
    if (user) {
      await tx
        .delete(verifications)
        .where(
          or(
            eq(verifications.identifier, user.email),
            like(verifications.identifier, `%otp-${user.email}`),
          ),
        );
    }
    await tx.delete(users).where(eq(users.id, userId));
    await recordPlatformEvent(tx, {
      type: 'renter.account_deleted',
      actor: { type: 'system' },
      data: {},
    });
  });
  return 'deleted';
}
