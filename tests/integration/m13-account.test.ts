import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg, withSystem } from '@/db/client';
import {
  applications,
  listings,
  profileShares,
  renterProfiles,
  savedHomes,
  users,
} from '@/db/schema';
import { saveHome } from '@/server/alerts/saved-homes';
import { saveSearch } from '@/server/alerts/searches';
import { enquireAboutListing } from '@/server/enquiries/marketplace';
import { listingStats } from '@/server/listings/stats';
import { publishListing } from '@/server/listings/publish';
import { recordListingView } from '@/server/measurement/views';
import { deleteRenterAccount, myData } from '@/server/renters/account';
import { startRenting } from '@/server/renters/profile';
import { aCheckedLandlord, aListableLetting } from './listing-helpers';

/** M13: a renter's data, downloaded and deleted by them. M92: a listing's numbers by day. */

async function aRenter() {
  const userId = crypto.randomUUID();
  const email = `account.${userId.slice(0, 8)}@example.ie`;
  await db().insert(users).values({ id: userId, name: 'Aoife Byrne', email, emailVerified: true });
  await startRenting(userId, 'Aoife');
  return { userId, email };
}

async function aLiveListing() {
  const member = await aCheckedLandlord();
  const { lettingId } = await aListableLetting(member);
  const published = await publishListing(member, lettingId, { declare: true });
  if (published.outcome !== 'live') throw new Error('not live');
  const [listing] = await withOrg(member.organisationId, (tx) =>
    tx.select({ id: listings.id }).from(listings).where(eq(listings.lettingId, lettingId)),
  );
  return { member, lettingId, slug: published.slug, listingId: listing!.id };
}

describe('M13: download all their data, and delete the account', () => {
  it('downloads everything the renter has on Gaff, then deletes it; letters keep their copies', async () => {
    const { member, slug, listingId } = await aLiveListing();
    const renter = await aRenter();
    const enquiry = await enquireAboutListing(renter, slug, {
      fullName: 'Aoife Byrne',
      occupants: '2',
      hasPets: 'no',
      keepDetails: 'yes',
      mobile: '087 765 4321',
    });
    if (!enquiry.ok) throw new Error('refused');
    await saveHome(renter.userId, listingId);
    await saveSearch(renter.userId, '/to-rent/dublin', 'beds=2');

    const data = await myData(renter.userId);
    expect(data).toMatchObject({
      account: { email: renter.email },
      profile: { givenName: 'Aoife', keepDetails: true, mobile: '087 765 4321' },
      homesEnquiredAbout: [expect.objectContaining({ applicationId: enquiry.applicationId })],
      savedHomes: [expect.objectContaining({ listingId })],
      savedSearches: [expect.objectContaining({ areaPath: '/to-rent/dublin' })],
      applications: [expect.objectContaining({ fullName: 'Aoife Byrne', status: 'enquired' })],
      whoHasYourDetails: [expect.objectContaining({ letterName: 'Mary' })],
    });

    expect(await deleteRenterAccount(renter.userId)).toBe('deleted');
    expect(await db().select().from(users).where(eq(users.id, renter.userId))).toEqual([]);
    const left = await withSystem(async (tx) => ({
      profiles: await tx
        .select()
        .from(renterProfiles)
        .where(eq(renterProfiles.userId, renter.userId)),
      saved: await tx.select().from(savedHomes).where(eq(savedHomes.userId, renter.userId)),
      shares: await tx.select().from(profileShares).where(eq(profileShares.userId, renter.userId)),
    }));
    expect(left).toEqual({ profiles: [], saved: [], shares: [] });
    // The letter's copy stays until its own deletion date, linked to no account.
    const [copy] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(applications).where(eq(applications.id, enquiry.applicationId)),
    );
    expect(copy).toMatchObject({ fullName: 'Aoife Byrne', renterUserId: null });
  });

  it('keeps the account of someone who also lets homes', async () => {
    const member = await aCheckedLandlord();
    expect(await deleteRenterAccount(member.userId)).toBe('is_a_letter');
  });
});

describe('M92: a listing’s views, saves and enquiries by day', () => {
  it('counts them for the letter, without knowing who', async () => {
    const { member, lettingId, slug, listingId } = await aLiveListing();
    const iphone =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    await recordListingView(listingId, { ip: '192.0.2.10', userAgent: iphone });
    await recordListingView(listingId, { ip: '192.0.2.11', userAgent: iphone });
    const renter = await aRenter();
    await saveHome(renter.userId, listingId);
    await saveHome(renter.userId, listingId);
    await enquireAboutListing(renter, slug, {
      fullName: 'Aoife Byrne',
      occupants: '1',
      hasPets: 'no',
    });
    const stats = await listingStats(member, lettingId);
    expect(stats!.totals).toEqual({ views: 2, visitors: 2, saves: 1, enquiries: 1 });
    expect(stats!.rows[0]).toMatchObject({ views: 2, saves: 1, enquiries: 1 });
  });
});
