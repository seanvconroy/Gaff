import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { db, withOrg } from '@/db/client';
import { applications, homes, lettings, listings, memberships, users } from '@/db/schema';
import { confirmationDue } from '@/domain/listings/freshness';
import { listingTitle } from '@/domain/listings/projection';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { loadListing } from './context';
import { moveListing } from './publish';

export interface ListingRow {
  lettingId: string;
  listingId: string;
  title: string;
  address: string;
  status: (typeof listings.$inferSelect)['status'];
  slug: string | null;
  assignedTo: string | null;
  assignedName: string | null;
  publishedAt: Date | null;
  confirmationDue: Date | null;
  enquiries: number;
}

/** M91, M93: every listing in the organisation, newest first, with what needs attention. */
export async function listingsOverview(
  member: Member,
  filter: { assignedTo?: string } = {},
): Promise<ListingRow[]> {
  const rows = await withOrg(member.organisationId, async (tx) => {
    const found = await tx
      .select({ listing: listings, home: homes })
      .from(listings)
      .innerJoin(homes, eq(homes.id, listings.homeId))
      .where(filter.assignedTo ? eq(listings.assignedTo, filter.assignedTo) : undefined)
      .orderBy(desc(listings.createdAt));
    const lettingIds = found.map((f) => f.listing.lettingId);
    const enquiries = lettingIds.length
      ? await tx
          .select({ lettingId: applications.lettingId, n: count() })
          .from(applications)
          .where(inArray(applications.lettingId, lettingIds))
          .groupBy(applications.lettingId)
      : [];
    return { found, enquiries };
  });
  const people = await db()
    .select({ userId: memberships.userId, name: users.name, displayName: memberships.displayName })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organisationId, member.organisationId));
  return rows.found.map(({ listing, home }) => {
    const person = people.find((p) => p.userId === listing.assignedTo);
    return {
      lettingId: listing.lettingId,
      listingId: listing.id,
      title: listingTitle(home),
      address: home.addressLine1,
      status: listing.status,
      slug: listing.slug,
      assignedTo: listing.assignedTo,
      assignedName: person ? (person.displayName ?? person.name) : null,
      publishedAt: listing.publishedAt,
      confirmationDue:
        listing.status === 'live' && listing.confirmedAt
          ? confirmationDue(listing.confirmedAt)
          : null,
      enquiries: rows.enquiries.find((e) => e.lettingId === listing.lettingId)?.n ?? 0,
    };
  });
}

/** M93: an admin gives a listing to another agent on the team. */
export async function reassignListing(member: Member, listingId: string, userId: string) {
  if (member.role !== 'admin') throw new UserFacingError('Only an admin can reassign listings.');
  const [colleague] = await db()
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(eq(memberships.organisationId, member.organisationId), eq(memberships.userId, userId)),
    );
  if (!colleague) throw new UserFacingError('They’re not on your team.');
  await withOrg(member.organisationId, (tx) =>
    tx.update(listings).set({ assignedTo: userId }).where(eq(listings.id, listingId)),
  );
}

/** M50: the letter pauses a live listing, or puts a paused one back live. */
export async function setPaused(member: Member, lettingId: string, paused: boolean) {
  await withOrg(member.organisationId, async (tx) => {
    const context = await loadListing(tx, lettingId);
    if (!context) throw new UserFacingError('We couldn’t find that listing.');
    const status = context.listing.status;
    if (paused && status !== 'live')
      throw new UserFacingError('Only a live listing can be paused.');
    if (!paused && status !== 'paused') throw new UserFacingError('That listing isn’t paused.');
    await moveListing(tx, context, paused ? 'paused' : 'live', 'letter', member.userId);
  });
}

/**
 * M52: enquiries close at the time the letter set (a job), or when the limit is reached
 * (milestone 5, at each enquiry). The same for everyone.
 */
export async function closeEnquiries(job: { organisationId: string; lettingId: string }) {
  await withOrg(job.organisationId, async (tx) => {
    const context = await loadListing(tx, job.lettingId);
    if (!context || context.listing.status !== 'live') return;
    const closeAt = context.letting.enquiriesCloseAt;
    if (!closeAt || closeAt > new Date()) return;
    await moveListing(tx, context, 'enquiries_closed', 'enquiry_limit', null);
  });
}

/** M94: lets a home again from a closed letting, as a new letting set up from the home. */
export async function relistHome(
  member: Member,
  lettingId: string,
): Promise<{ lettingId: string }> {
  return withOrg(member.organisationId, async (tx) => {
    const [old] = await tx
      .select({ letting: lettings, home: homes })
      .from(lettings)
      .innerJoin(homes, eq(homes.id, lettings.homeId))
      .where(eq(lettings.id, lettingId));
    if (!old) throw new UserFacingError('We couldn’t find that letting.');
    if (old.letting.status !== 'let' && old.letting.status !== 'withdrawn') {
      throw new UserFacingError('This home is still being let.');
    }
    const { letting, home } = old;
    const [created] = await tx
      .insert(lettings)
      .values({
        organisationId: member.organisationId,
        homeId: home.id,
        landlordId: letting.landlordId,
        addressLine1: home.addressLine1,
        addressLine2: home.addressLine2,
        area: home.area,
        county: home.county,
        eircode: home.eircode,
        monthlyRentCents: letting.monthlyRentCents,
        availableFrom:
          letting.availableFrom > new Date().toISOString().slice(0, 10)
            ? letting.availableFrom
            : new Date().toISOString().slice(0, 10),
        propertyType: home.propertyType,
        bedrooms: home.bedrooms,
        bathrooms: home.bathrooms,
        furnished: letting.furnished,
        berRating: home.berRating,
        parking: home.parking,
        depositCents: letting.depositCents,
        createdBy: member.userId,
      })
      .returning({ id: lettings.id });
    await tx.insert(listings).values({
      organisationId: member.organisationId,
      lettingId: created!.id,
      homeId: home.id,
      createdBy: member.userId,
      description: (
        await tx
          .select({ d: listings.description })
          .from(listings)
          .where(eq(listings.lettingId, lettingId))
      )[0]?.d,
    });
    return { lettingId: created!.id };
  });
}
