import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import { homes, lettings, listings, viewingSessions } from '@/db/schema';
import {
  addHomesLike,
  createDevelopment,
  developmentForEditor,
  publishDevelopment,
  publishReadyHomes,
  updateDevelopment,
} from '@/server/developments/developments';
import { createLetting } from '@/server/lettings/create-letting';
import { recordRentCheck } from '@/server/lettings/rent-check';
import { setCriteria } from '@/server/lettings/set-criteria';
import { addViewingSession } from '@/server/lettings/viewing-sessions';
import { startTakingEnquiries } from '@/server/lettings/go-live';
import { saveDescription, saveHomeDetails, saveLettingDetails } from '@/server/listings/editor';
import { publishListing } from '@/server/listings/publish';
import { publicDevelopmentBySlug } from '@/server/search/developments';
import { publicListingBySlug } from '@/server/search/listing';
import { aLetting, aViewingSession, daysFromToday } from '../fixtures/lettings';
import { addPhotos, aCheckedLandlord, freshShades, placePin } from './listing-helpers';

/** M32 to M35, M75: developments, the homes in them, and many homes at once. */

const DESCRIPTION =
  'A new build-to-rent development beside the Luas at Sandyford, with a gym, a roof terrace and bike storage for every home.';

async function aDevelopment() {
  const member = await aCheckedLandlord();
  const created = await createDevelopment(member, {
    name: 'The Waterside',
    addressLine1: 'Waterside Road',
    area: 'Sandyford, Dublin 18',
    county: 'Dublin',
    amenities: 'gym,roof_terrace,bike_storage',
  });
  if (!created.ok) throw new Error(JSON.stringify(created.errors));
  return { member, id: created.id };
}

describe('M32, M75: a development and its page', () => {
  it('can’t go live until it’s described and photographed, then has a public page', async () => {
    const { member, id } = await aDevelopment();
    expect((await publishDevelopment(member, id)).ok).toBe(false);
    expect(
      await updateDevelopment(member, id, { description: DESCRIPTION, amenities: 'gym,lift' }),
    ).toEqual({ ok: true, id });
    await addPhotos(member, id, freshShades(), 'development');
    expect(await publishDevelopment(member, id)).toEqual({ ok: true });
    const detail = await developmentForEditor(member, id);
    const page = await publicDevelopmentBySlug(detail!.development.slug);
    expect(page).toMatchObject({
      name: 'The Waterside',
      amenities: ['gym', 'lift'],
      operator: { kind: 'landlord', name: 'Mary' },
    });
    expect(page!.photos).toHaveLength(3);
  });

  it('M46: refuses protected-ground wording in a live development’s description', async () => {
    const { member, id } = await aDevelopment();
    await updateDevelopment(member, id, { description: DESCRIPTION });
    await addPhotos(member, id, freshShades(), 'development');
    await publishDevelopment(member, id);
    const result = await updateDevelopment(member, id, {
      description: `${DESCRIPTION} Ideal for professionals, no HAP.`,
    });
    expect(result).toMatchObject({ ok: false, errors: { description: expect.any(String) } });
  });
});

describe('M33 to M35: homes in a development', () => {
  it('a home uses the development’s location and photos, and many more are copied from it', async () => {
    const { member, id } = await aDevelopment();
    await updateDevelopment(member, id, { description: DESCRIPTION });
    await addPhotos(member, id, freshShades(), 'development');
    await publishDevelopment(member, id);

    // M33: the first home: no photos of its own, its own floor and size.
    const { lettingId } = await createLetting(
      member,
      aLetting({
        addressLine1: 'Apartment 1, Waterside Road',
        area: 'Sandyford, Dublin 18',
        rent: '2,650',
        eircode: '',
      }),
      { developmentId: id, floor: 1, floorAreaSqm: 72 },
    );
    await addViewingSession(member, lettingId, aViewingSession());
    await setCriteria(member, lettingId, { maxOccupants: 3, noPets: false });
    await recordRentCheck(member, lettingId, { lastLet: 'never' }, 265_000);
    await startTakingEnquiries(member, lettingId);
    await saveHomeDetails(member, lettingId, {
      showExactAddress: 'no',
      heating: 'heat_pump',
      outdoorSpace: 'balcony',
      floorAreaSqm: '72',
    });
    await saveLettingDetails(member, lettingId, { deposit: '2,650' });
    await saveDescription(member, lettingId, `${DESCRIPTION} Apartment 1 faces south.`);
    // M38: the letter places the pin once; it's the development's, and its later homes'.
    await placePin(member, lettingId);
    const first = await publishListing(member, lettingId, { declare: true });
    expect(first).toMatchObject({ outcome: 'live' });
    const listing = await publicListingBySlug(first.outcome === 'live' ? first.slug : '');
    expect(listing!.photos).toHaveLength(3);

    // M35: two more like it, pasted from a spreadsheet.
    const added = await addHomesLike(
      member,
      id,
      lettingId,
      `Apartment 12\t3\t2700\t${daysFromToday(40)}\t74\nApartment 14\t4\t2750\t${daysFromToday(45)}`,
    );
    if (!added.ok) throw new Error(added.errors.join(' '));
    expect(added.added).toHaveLength(2);
    const [copy] = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ letting: lettings, home: homes })
        .from(lettings)
        .innerJoin(homes, eq(homes.id, lettings.homeId))
        .where(eq(lettings.id, added.added[0]!)),
    );
    expect(copy).toMatchObject({
      letting: {
        addressLine1: 'Apartment 12, Waterside Road',
        monthlyRentCents: 270_000,
        depositCents: 265_000,
        criteria: { maxOccupants: 3, noPets: false },
      },
      home: {
        developmentId: id,
        floor: 3,
        floorAreaSqm: 74,
        heating: 'heat_pump',
        pointSource: 'letter',
      },
    });
    const sessions = await withOrg(member.organisationId, (tx) =>
      tx.select().from(viewingSessions).where(eq(viewingSessions.lettingId, added.added[0]!)),
    );
    expect(sessions).toHaveLength(1);

    // Publish both, with one declaration; the development page shows them by type (M34).
    expect(await publishReadyHomes(member, id)).toEqual({ published: 2, held: 0, notReady: 0 });
    const detail = await developmentForEditor(member, id);
    const page = await publicDevelopmentBySlug(detail!.development.slug);
    expect(page!.byType).toEqual([
      expect.objectContaining({ bedrooms: 2, available: 3, fromRentCents: 265_000 }),
    ]);
    const [statuses] = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ status: listings.status })
        .from(listings)
        .where(eq(listings.lettingId, added.added[1]!)),
    );
    expect(statuses?.status).toBe('live');
  });

  it('M35: names the line that’s wrong, and adds nothing', async () => {
    const { member, id } = await aDevelopment();
    const { lettingId } = await createLetting(member, aLetting({ eircode: '' }), {
      developmentId: id,
    });
    expect(await addHomesLike(member, id, lettingId, 'Apartment 2, 1, lots, 2026-12-01')).toEqual({
      ok: false,
      errors: ['Line 1: enter the rent a month in euro, like 2650'],
    });
  });
});
