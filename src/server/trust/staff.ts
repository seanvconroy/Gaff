import { and, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { type Tx, withSystem } from '@/db/client';
import { lettings, listingReports, organisations } from '@/db/schema';
import { oneWorkingDayAfter } from '@/domain/dashboard/views';
import {
  homeHref,
  homeSummary,
  homeTitle,
  publicLister,
  type PublicLister,
} from '@/domain/homes/home-page';
import {
  hideListingSchema,
  likeliestReason,
  reportDeleteAfter,
  type ReportReason,
} from '@/domain/homes/report';
import type { Staff } from '@/server/auth/staff';
import { queueWaitingFirstReplies } from '@/server/enquiries/first-reply';
import { UserFacingError } from '@/server/errors';
import { enqueue } from '@/server/jobs/enqueue';
import { recordEvent } from '@/server/record/events';

/**
 * UX-TS-4, UX-TS-5 (Q13): what Gaff's own team does about reported listings, from the internal
 * page. Every function takes a `Staff`, which only `requireStaff()` makes.
 *
 * Staff read a report and the home's public facts (what its page on gaff.ie shows), and do one
 * of two things: hide the listing, or keep it up. They can put a hidden listing back. That is
 * all. Nothing here reads a letting's people, applications, messages, viewings or decisions,
 * writes to any of them, or sends anyone a message: the lister is emailed by Gaff, in fixed
 * words (`listingHiddenEmail`), and the enquiries that waited while a home was hidden get the
 * same fixed first reply they would have had, on the lister's own decision to put it live.
 * A test holds this (tests/integration/ux-ts-trust.test.ts).
 */

/** A report as staff read it: the answer tapped, the note, and when. Nobody's details. */
export interface ReportRead {
  id: string;
  reason: ReportReason;
  note: string | null;
  receivedAt: Date;
}

/** The home a report is about, as its public page shows it. */
interface ListingFacts {
  lettingId: string;
  ref: string;
  title: string;
  summary: string;
  lister: PublicLister;
}

export interface ReportedListing extends ListingFacts {
  /** Waiting for an answer, oldest first. */
  reports: ReportRead[];
  /** UX-TS-4: within one working day of the first. */
  answerBy: Date;
  /** The reason offered first if staff hide it. */
  likeliest: ReportReason;
  /** Its page on gaff.ie, while it has one. */
  href: string;
}

export interface HiddenListing extends ListingFacts {
  reason: ReportReason | null;
  hiddenAt: Date;
  lookAgainAskedAt: Date | null;
  /** The home's own description, as its page showed it: to look at again. */
  description: string | null;
}

const listingColumns = {
  lettingId: lettings.id,
  ref: lettings.publicRef,
  addressLine1: lettings.addressLine1,
  area: lettings.area,
  monthlyRentCents: lettings.monthlyRentCents,
  propertyType: lettings.propertyType,
  bedrooms: lettings.bedrooms,
  furnished: lettings.furnished,
  listerKind: organisations.kind,
  listerName: organisations.name,
  psraLicenceNumber: organisations.psraLicenceNumber,
  confirmedAt: organisations.confirmedAt,
  licenceLapsedAt: organisations.licenceLapsedAt,
};

type ListingRow = {
  lettingId: string;
  ref: string;
  addressLine1: string;
  area: string;
  monthlyRentCents: number;
  propertyType: string;
  bedrooms: number;
  furnished: string | null;
  listerKind: 'agency' | 'landlord' | 'private_landlord';
  listerName: string;
  psraLicenceNumber: string | null;
  confirmedAt: Date | null;
  licenceLapsedAt: Date | null;
};

function factsOf(row: ListingRow): ListingFacts {
  return {
    lettingId: row.lettingId,
    ref: row.ref,
    title: homeTitle(row),
    summary: homeSummary(row),
    lister: publicLister({
      kind: row.listerKind,
      name: row.listerName,
      psraLicenceNumber: row.psraLicenceNumber,
      confirmedAt: row.confirmedAt,
      licenceLapsedAt: row.licenceLapsedAt,
    }),
  };
}

/**
 * UX-TS-5: the internal page's list of reported listings: those with reports waiting, oldest
 * first, and those hidden now, newest first. Across every lister, so as the system.
 */
export async function reportedListingsFor(
  _staff: Staff,
): Promise<{ waiting: ReportedListing[]; hidden: HiddenListing[] }> {
  return withSystem(async (tx) => {
    const open = await tx
      .select({
        report: {
          id: listingReports.id,
          reason: listingReports.reason,
          note: listingReports.note,
          receivedAt: listingReports.receivedAt,
        },
        listing: listingColumns,
        hiddenAt: lettings.hiddenAt,
      })
      .from(listingReports)
      .innerJoin(lettings, eq(lettings.id, listingReports.lettingId))
      .innerJoin(organisations, eq(organisations.id, lettings.organisationId))
      .where(isNull(listingReports.outcome))
      .orderBy(asc(listingReports.receivedAt));
    const byListing = new Map<string, ReportedListing>();
    for (const { report, listing, hiddenAt } of open) {
      // A report that came in just as the listing was hidden is answered by hiding it.
      if (hiddenAt) continue;
      const seen = byListing.get(listing.lettingId);
      if (seen) seen.reports.push(report);
      else {
        byListing.set(listing.lettingId, {
          ...factsOf(listing as ListingRow),
          reports: [report],
          answerBy: oneWorkingDayAfter(report.receivedAt),
          likeliest: report.reason,
          href: homeHref(listing.ref),
        });
      }
    }
    const waiting = [...byListing.values()].map((listing) => ({
      ...listing,
      likeliest: likeliestReason(listing.reports) ?? listing.likeliest,
    }));

    const hiddenRows = await tx
      .select({
        listing: listingColumns,
        reason: lettings.hiddenReason,
        hiddenAt: lettings.hiddenAt,
        lookAgainAskedAt: lettings.lookAgainAskedAt,
        description: lettings.description,
      })
      .from(lettings)
      .innerJoin(organisations, eq(organisations.id, lettings.organisationId))
      .where(isNotNull(lettings.hiddenAt))
      .orderBy(desc(lettings.lookAgainAskedAt), desc(lettings.hiddenAt));
    const hidden = hiddenRows.map((row) => ({
      ...factsOf(row.listing as ListingRow),
      reason: row.reason,
      hiddenAt: row.hiddenAt!,
      lookAgainAskedAt: row.lookAgainAskedAt,
      description: row.description,
    }));
    return { waiting, hidden };
  });
}

const lettingIdSchema = z.uuid();

/** The letting a staff action is about, locked, or "not found" for anything else. */
async function lockedListing(tx: Tx, lettingId: string) {
  if (!lettingIdSchema.safeParse(lettingId).success) {
    throw new UserFacingError('We couldn’t find that listing.');
  }
  const [letting] = await tx
    .select({
      id: lettings.id,
      organisationId: lettings.organisationId,
      status: lettings.status,
      hiddenAt: lettings.hiddenAt,
    })
    .from(lettings)
    .where(eq(lettings.id, lettingId))
    .for('update');
  if (!letting) throw new UserFacingError('We couldn’t find that listing.');
  return letting;
}

/** Answers every report waiting on a listing, and gives each its deletion date. */
async function answerReports(
  tx: Tx,
  staff: Staff,
  lettingId: string,
  outcome: 'hidden' | 'kept_up',
  now: Date,
): Promise<number> {
  const answered = await tx
    .update(listingReports)
    .set({
      outcome,
      answeredAt: now,
      answeredBy: staff.userId,
      deleteAfter: reportDeleteAfter(now),
    })
    .where(and(eq(listingReports.lettingId, lettingId), isNull(listingReports.outcome)))
    .returning({ id: listingReports.id });
  return answered.length;
}

/**
 * UX-TS-4: "Hide this listing". It leaves search and its page at once (the public query reads
 * `hiddenAt`), its enquiries wait (no first reply or answer is sent while it's hidden), and its
 * lister is emailed with the reason. Recorded with actor `staff`.
 */
export async function hideListing(
  staff: Staff,
  input: { lettingId: string; reason: string },
  now: Date = new Date(),
): Promise<{ hidden: boolean }> {
  const parsed = hideListingSchema.safeParse(input);
  if (!parsed.success) throw new UserFacingError('Choose why it’s being hidden.');
  return withSystem(async (tx) => {
    const letting = await lockedListing(tx, parsed.data.lettingId);
    if (letting.hiddenAt) return { hidden: false };
    await tx
      .update(lettings)
      .set({ hiddenAt: now, hiddenReason: parsed.data.reason, lookAgainAskedAt: null })
      .where(eq(lettings.id, letting.id));
    const reports = await answerReports(tx, staff, letting.id, 'hidden', now);
    await recordEvent(tx, {
      organisationId: letting.organisationId,
      lettingId: letting.id,
      actor: { type: 'staff', userId: staff.userId },
      type: 'listing.hidden',
      data: { reason: parsed.data.reason, reports },
      occurredAt: now,
    });
    await enqueue(tx, 'send_account_email', {
      kind: 'listing_hidden',
      organisationId: letting.organisationId,
      lettingId: letting.id,
    });
    return { hidden: true };
  });
}

/** UX-TS-4: "Keep it up": staff read the reports and the listing stays. The lister isn't told. */
export async function keepListingUp(
  staff: Staff,
  lettingId: string,
  now: Date = new Date(),
): Promise<{ answered: number }> {
  return withSystem(async (tx) => {
    const letting = await lockedListing(tx, lettingId);
    const reports = await answerReports(tx, staff, letting.id, 'kept_up', now);
    if (reports > 0) {
      await recordEvent(tx, {
        organisationId: letting.organisationId,
        lettingId: letting.id,
        actor: { type: 'staff', userId: staff.userId },
        type: 'listing.kept_up',
        data: { reports },
        occurredAt: now,
      });
    }
    return { answered: reports };
  });
}

/**
 * UX-TS-4: "Put it back on gaff.ie". Its page and its place in search return, the enquiries
 * that waited get their fixed first replies, and the lister is emailed. Recorded with actor
 * `staff`.
 */
export async function unhideListing(
  staff: Staff,
  lettingId: string,
  now: Date = new Date(),
): Promise<{ back: boolean }> {
  return withSystem(async (tx) => {
    const letting = await lockedListing(tx, lettingId);
    if (!letting.hiddenAt) return { back: false };
    await tx
      .update(lettings)
      .set({ hiddenAt: null, hiddenReason: null, lookAgainAskedAt: null })
      .where(eq(lettings.id, letting.id));
    // The lister's own decision to put it live stands: what waited goes now, as at go-live.
    const firstReplies =
      letting.status === 'live'
        ? await queueWaitingFirstReplies(tx, letting.organisationId, letting.id)
        : 0;
    await recordEvent(tx, {
      organisationId: letting.organisationId,
      lettingId: letting.id,
      actor: { type: 'staff', userId: staff.userId },
      type: 'listing.unhidden',
      data: { firstReplies },
      occurredAt: now,
    });
    await enqueue(tx, 'send_account_email', {
      kind: 'listing_back',
      organisationId: letting.organisationId,
      lettingId: letting.id,
    });
    return { back: true };
  });
}
