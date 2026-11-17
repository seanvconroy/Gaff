import { and, desc, eq, inArray } from 'drizzle-orm';
import { withPerson } from '@/db/client';
import { renterEnquiries } from '@/db/schema';
import { oneAtATime } from './contexts';
import { recordProfileEvent } from './profile-events';
import { ensureRenterIn } from './renter-profile';

/**
 * A renter's own list of the homes they've asked about (UX-RH-1, UX-RH-4). Each row points at an
 * application: which organisation holds it, and which letting it is for. The list belongs to the
 * person and to no organisation: it is read and written only here, inside `withPerson()` for the
 * signed-in person themselves, so no operator can tell who has a profile (UX-AC-5).
 *
 * What a row shows (where they stand, what's next) is read from the application itself, in its
 * organisation's scope, by `src/server/renter/enquiries.ts`.
 */
export interface EnquiryPointer {
  applicationId: string;
  organisationId: string;
  lettingId: string;
  addedAt: Date;
}

/** Every enquiry in the signed-in person's own list, newest first. */
export async function ownEnquiries(userId: string): Promise<EnquiryPointer[]> {
  const rows = await withPerson(userId, (tx) =>
    tx
      .select()
      .from(renterEnquiries)
      .where(eq(renterEnquiries.userId, userId))
      .orderBy(desc(renterEnquiries.createdAt)),
  );
  return rows.map((row) => ({
    applicationId: row.applicationId,
    organisationId: row.listerOrganisationId,
    lettingId: row.lettingId,
    addedAt: row.createdAt,
  }));
}

/** One enquiry in their list, or null if it isn't theirs. */
export async function ownEnquiry(
  userId: string,
  applicationId: string,
): Promise<EnquiryPointer | null> {
  const [row] = await withPerson(userId, (tx) =>
    tx
      .select()
      .from(renterEnquiries)
      .where(
        and(eq(renterEnquiries.userId, userId), eq(renterEnquiries.applicationId, applicationId)),
      ),
  );
  return row
    ? {
        applicationId: row.applicationId,
        organisationId: row.listerOrganisationId,
        lettingId: row.lettingId,
        addedAt: row.createdAt,
      }
    : null;
}

/**
 * UX-RH-4: adds an enquiry to a person's Enquiries. The caller has shown it is theirs
 * (`enquiryIsTheirs`, or it was made by them while signed in: WP-22's "Ask to view"). One enquiry
 * is one person's: if it is already in somebody's list, nothing changes. Returns whether it is in
 * this person's list afterwards.
 *
 * Someone with an enquiry is renting, so "Renting" becomes one of their contexts.
 */
export async function attachEnquiry(
  userId: string,
  enquiry: { applicationId: string; organisationId: string; lettingId: string },
  now = new Date(),
): Promise<boolean> {
  return withPerson(userId, async (tx) => {
    await oneAtATime(tx, userId);
    await ensureRenterIn(tx, userId, now);
    const added = await tx
      .insert(renterEnquiries)
      .values({
        userId,
        applicationId: enquiry.applicationId,
        listerOrganisationId: enquiry.organisationId,
        lettingId: enquiry.lettingId,
      })
      // No target is named: another person's row can't be read from here, only met.
      .onConflictDoNothing()
      .returning({ applicationId: renterEnquiries.applicationId });
    if (added.length > 0) {
      await recordProfileEvent(tx, userId, 'profile.enquiry_added', {
        applicationId: enquiry.applicationId,
      });
      return true;
    }
    const [own] = await tx
      .select({ applicationId: renterEnquiries.applicationId })
      .from(renterEnquiries)
      .where(
        and(
          eq(renterEnquiries.userId, userId),
          eq(renterEnquiries.applicationId, enquiry.applicationId),
        ),
      );
    return Boolean(own);
  });
}

/** Takes enquiries off a person's own list: ones whose details have since been deleted (rule 9). */
export async function forgetEnquiries(userId: string, applicationIds: string[]): Promise<void> {
  if (applicationIds.length === 0) return;
  await withPerson(userId, (tx) =>
    tx
      .delete(renterEnquiries)
      .where(
        and(
          eq(renterEnquiries.userId, userId),
          inArray(renterEnquiries.applicationId, applicationIds),
        ),
      ),
  );
}

/**
 * UX-AC-14: whether a person's own Enquiries hold an enquiry about this letting. Asked for the
 * signed-in member themselves, on their own path; the answer is a yes or a no.
 */
export async function holdsEnquiryFor(userId: string, lettingId: string): Promise<boolean> {
  const [row] = await withPerson(userId, (tx) =>
    tx
      .select({ applicationId: renterEnquiries.applicationId })
      .from(renterEnquiries)
      .where(and(eq(renterEnquiries.userId, userId), eq(renterEnquiries.lettingId, lettingId)))
      .limit(1),
  );
  return Boolean(row);
}
