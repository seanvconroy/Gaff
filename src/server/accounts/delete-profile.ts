import { and, eq, isNotNull, lte, sql } from 'drizzle-orm';
import { type Tx, withPerson, withSystem } from '@/db/client';
import {
  accounts,
  applications,
  memberships,
  passkeys,
  profileEvents,
  profiles,
  renterEnquiries,
  renterProfiles,
  savedHomes,
  savedSearches,
  users,
} from '@/db/schema';
import {
  deletionDateAfterNotice,
  deletionRemoves,
  PROFILE_NOTICE_DAYS,
  PROFILE_UNUSED_YEARS,
  profileRetention,
} from '@/domain/profile/retention';
import { type Confirmation, spendConfirmation } from '@/server/auth/confirm';
import { enqueue } from '@/server/jobs/enqueue';
import { oneAtATime, type SignedInPerson } from './contexts';
import { ownEnquiries } from './enquiries';
import { recordProfileEvent } from './profile-events';
import { readRenterProfile } from './renter-profile';

/**
 * UX-PF-6, UX-PF-7 (rule 9): deleting a renter's profile, and "Download my details".
 *
 * Deleting is immediate and whole: every row of every table that belongs to the person as a
 * renter goes in one transaction (what they keep, their list of enquiries, the homes and searches
 * they saved, the record of their profile), and nothing is queued. The sign-in goes too, unless they also let homes on Gaff
 * (`deletionRemoves`). One line stays in the record, with IDs only, saying a profile was deleted.
 *
 * What does not go: an application to a letting. That is the operator's copy, and it is cleared
 * on the letting's own schedule by the retention job (R26). The renter's emails about it still
 * reach them and its links still work.
 */

/**
 * Removes everything, in a transaction that is the person's own or the system's. Returns whether
 * the sign-in went too.
 */
async function deleteProfileIn(
  tx: Tx,
  userId: string,
  by: 'person' | 'retention',
): Promise<{ account: boolean }> {
  await tx.delete(renterEnquiries).where(eq(renterEnquiries.userId, userId));
  // Saved (WP-23): the homes they saved and the searches they asked to hear about.
  await tx.delete(savedHomes).where(eq(savedHomes.userId, userId));
  await tx.delete(savedSearches).where(eq(savedSearches.userId, userId));
  await tx.delete(renterProfiles).where(eq(renterProfiles.userId, userId));
  await tx.delete(profileEvents).where(eq(profileEvents.userId, userId));
  const [{ organisations } = { organisations: 0 }] = await tx
    .select({ organisations: sql<number>`count(*)::int` })
    .from(memberships)
    .where(eq(memberships.userId, userId));
  let account = false;
  if (deletionRemoves({ organisations }).account) {
    try {
      // The person themselves: their sessions, sign-in methods, passkeys and profile go with
      // them. A savepoint, so a refusal leaves the rest of the deletion standing.
      await tx.transaction(async (inner) => {
        await inner.delete(users).where(eq(users.id, userId));
      });
      account = true;
    } catch {
      // Something they once did for an organisation still names them: the sign-in stays.
      account = false;
    }
  }
  if (!account) {
    await tx
      .update(profiles)
      .set({
        rentingSince: null,
        lastSide: sql`case when ${profiles.lastSide} = 'renting' then null else ${profiles.lastSide} end`,
      })
      .where(eq(profiles.userId, userId));
  }
  await recordProfileEvent(tx, userId, 'profile.deleted', { by, account });
  return { account };
}

/**
 * UX-PF-6: "Delete my profile". The person has just confirmed it's them (UX-SI-10); the
 * confirmation is spent in the same transaction as the deletion.
 */
export async function deleteProfile(
  person: SignedInPerson,
  confirmation: Confirmation | null,
): Promise<{ account: boolean }> {
  return withPerson(person.id, async (tx) => {
    await oneAtATime(tx, person.id);
    await spendConfirmation(tx, confirmation, 'delete_profile', person.id);
    return deleteProfileIn(tx, person.id, 'person');
  });
}

/**
 * UX-PF-7: the profile side of the nightly retention job. A renter's profile unused for two
 * years is deleted, 30 days after an email that says so. Run as the system, across people. The
 * rule is `profileRetention`; this only does what it says.
 */
export async function sweepProfiles(
  now: Date = new Date(),
): Promise<{ notices: number; deleted: number }> {
  // Nobody is looked at before the notice could be due: a little under two years.
  const soonest = new Date(
    now.getTime() - (PROFILE_UNUSED_YEARS * 365 - PROFILE_NOTICE_DAYS - 2) * 86_400_000,
  );
  return withSystem(async (tx) => {
    const candidates = await tx
      .select({
        userId: renterProfiles.userId,
        lastUsedAt: renterProfiles.lastUsedAt,
        noticeSentAt: renterProfiles.deletionNoticeSentAt,
      })
      .from(renterProfiles)
      .where(lte(renterProfiles.lastUsedAt, soonest));
    let notices = 0;
    let deleted = 0;
    for (const profile of candidates) {
      const todo = profileRetention(profile, now);
      if (todo === 'send_notice') {
        await tx
          .update(renterProfiles)
          .set({ deletionNoticeSentAt: now })
          .where(eq(renterProfiles.userId, profile.userId));
        const deleteOn = deletionDateAfterNotice(profile.lastUsedAt, now);
        await enqueue(tx, 'send_account_email', {
          kind: 'profile_unused',
          userId: profile.userId,
          deleteOn,
        });
        await recordProfileEvent(tx, profile.userId, 'profile.deletion_notice_sent', { deleteOn });
        notices += 1;
      } else if (todo === 'delete') {
        await deleteProfileIn(tx, profile.userId, 'retention');
        deleted += 1;
      }
    }
    // Rule 9: an application whose details were deleted on schedule leaves nothing to list.
    const stale = await tx
      .select({ applicationId: renterEnquiries.applicationId })
      .from(renterEnquiries)
      .innerJoin(applications, eq(applications.id, renterEnquiries.applicationId))
      .where(isNotNull(applications.personalDataDeletedAt));
    for (const row of stale) {
      await tx.delete(renterEnquiries).where(eq(renterEnquiries.applicationId, row.applicationId));
    }
    return { notices, deleted };
  });
}

/** What "Download my details" holds: everything on the person's own profile, and nothing else. */
export interface ProfileDownload {
  name: string;
  email: string;
  rentingSince: Date | null;
  kept: Awaited<ReturnType<typeof readRenterProfile>>;
  signIn: { providers: string[]; passkeys: number };
  enquiries: Array<{ applicationId: string; addedAt: Date }>;
  /** Saved: each home by its public reference, and each search as its chips' values. */
  saved: {
    homes: Array<{ ref: string; savedAt: Date }>;
    searches: Array<{ filters: Record<string, unknown>; savedAt: Date }>;
    alerts: boolean;
  };
}

/** Reads the person's own profile for the file, and notes that they took a copy. */
export async function profileForDownload(person: SignedInPerson): Promise<ProfileDownload> {
  const kept = await readRenterProfile(person.id);
  const enquiries = await ownEnquiries(person.id);
  return withPerson(person.id, async (tx) => {
    const [own] = await tx
      .select({ rentingSince: profiles.rentingSince })
      .from(profiles)
      .where(eq(profiles.userId, person.id));
    const methods = await tx
      .select({ provider: accounts.providerId })
      .from(accounts)
      .where(eq(accounts.userId, person.id));
    const keys = await tx
      .select({ id: passkeys.id })
      .from(passkeys)
      .where(and(eq(passkeys.userId, person.id)));
    const homes = await tx
      .select({ ref: savedHomes.homeRef, savedAt: savedHomes.createdAt })
      .from(savedHomes)
      .where(eq(savedHomes.userId, person.id));
    const searches = await tx
      .select({ filters: savedSearches.filters, savedAt: savedSearches.createdAt })
      .from(savedSearches)
      .where(eq(savedSearches.userId, person.id));
    await recordProfileEvent(tx, person.id, 'profile.downloaded', {});
    return {
      name: person.name,
      email: person.email,
      rentingSince: own?.rentingSince ?? null,
      kept,
      signIn: { providers: methods.map((method) => method.provider), passkeys: keys.length },
      enquiries: enquiries.map((enquiry) => ({
        applicationId: enquiry.applicationId,
        addedAt: enquiry.addedAt,
      })),
      saved: { homes, searches, alerts: kept.searchAlerts },
    };
  });
}
