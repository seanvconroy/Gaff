import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withPublic, withRenter, withSystem } from '@/db/client';
import {
  alertDeliveries,
  devOutbox,
  publicListings,
  savedHomes,
  savedSearches,
  users,
} from '@/db/schema';
import { matchListing, sendAlerts, sendDailyAlerts } from '@/server/alerts/match';
import { saveHome, savedHomesOf, unsaveHome } from '@/server/alerts/saved-homes';
import { mySearches, saveSearch, setFrequency, stopAlerts } from '@/server/alerts/searches';
import { readStopToken, stopToken } from '@/server/alerts/tokens';
import { recordRentCheck } from '@/server/lettings/rent-check';
import { saveLettingDetails } from '@/server/listings/editor';
import { publishListing } from '@/server/listings/publish';
import { sweepMarketplace } from '@/server/retention/marketplace';
import { startRenting } from '@/server/renters/profile';
import { queuedJobs } from './helpers';
import { aCheckedLandlord, aListableLetting } from './listing-helpers';

/** M10, M85 to M88: saved homes and alerts, in the renter's own zone. */

async function aRenter(): Promise<{ userId: string; email: string }> {
  const userId = crypto.randomUUID();
  const email = `alerts.${userId.slice(0, 8)}@example.ie`;
  await db().insert(users).values({ id: userId, name: 'Aoife Byrne', email, emailVerified: true });
  await startRenting(userId, 'Aoife');
  return { userId, email };
}

/** Homes in Kerry: no other test lists there, so the alerts are exactly these. */
async function aKerryHome(rent = '1,400') {
  const member = await aCheckedLandlord();
  const { lettingId } = await aListableLetting(member, undefined, {
    addressLine1: `${Math.floor(Math.random() * 90) + 1} Castle Street`,
    area: 'Tralee, Co. Kerry',
    county: 'Kerry',
    eircode: 'V92 C4D5',
    rent,
  });
  const published = await publishListing(member, lettingId, { declare: true });
  if (published.outcome !== 'live') throw new Error(`not live: ${published.outcome}`);
  const [row] = await withPublic((tx) =>
    tx
      .select({ listingId: publicListings.listingId, rentCents: publicListings.rentCents })
      .from(publicListings)
      .where(eq(publicListings.slug, published.slug)),
  );
  return { member, lettingId, slug: published.slug, listingId: row!.listingId };
}

async function outboxFor(email: string) {
  return db().select().from(devOutbox).where(eq(devOutbox.toAddress, email));
}

describe('M85: saved homes', () => {
  it('saves a home, shows a lower rent, and never shows it to anyone else', async () => {
    const { member, lettingId, listingId } = await aKerryHome('1,500');
    const renter = await aRenter();
    expect(await saveHome(renter.userId, listingId)).toBe(true);
    expect((await savedHomesOf(renter.userId))[0]).toMatchObject({ listingId, changes: [] });

    // M51: the letter lowers the deposit and the rent; the public copy and the saved home show it.
    await saveLettingDetails(member, lettingId, { deposit: '1,000' });
    await recordRentCheck(member, lettingId, { lastLet: 'never' }, 140_000);
    const [saved] = await savedHomesOf(renter.userId);
    expect(saved!.changes).toEqual([{ kind: 'rent_down', fromCents: 150_000, toCents: 140_000 }]);
    expect(saved!.current?.rentCents).toBe(140_000);

    const other = await aRenter();
    expect(await withRenter(other.userId, (tx) => tx.select().from(savedHomes))).toEqual([]);
    await unsaveHome(renter.userId, listingId);
    expect(await savedHomesOf(renter.userId)).toEqual([]);
  });

  it('refuses a rent below the deposit, so the deposit cap holds (M39)', async () => {
    const { member, lettingId } = await aKerryHome('1,500');
    await expect(recordRentCheck(member, lettingId, { lastLet: 'never' }, 120_000)).rejects.toThrow(
      /deposit/,
    );
  });
});

describe('M86, M87: alerts', () => {
  it('matches a new home to saved searches once, and sends one email with one-click unsubscribe', async () => {
    const renter = await aRenter();
    const saved = await saveSearch(renter.userId, '/to-rent/kerry', 'max=1500&beds=2');
    if (!saved || 'tooMany' in saved) throw new Error('not saved');
    const elsewhere = await saveSearch(renter.userId, '/to-rent/cork', '');
    expect(elsewhere).toMatchObject({ id: expect.any(String) });

    const { listingId } = await aKerryHome('1,400');
    // Going live queues the match (M87), in the same transaction.
    expect(await queuedJobs('alerts_match')).toContainEqual({ listingId });
    expect(await matchListing(listingId)).toBeGreaterThanOrEqual(1);
    expect(await matchListing(listingId)).toBe(0);
    expect(await queuedJobs('alerts_send')).toContainEqual({
      userId: renter.userId,
      frequency: 'instant',
    });

    expect(await sendAlerts(renter.userId, 'instant')).toBe(1);
    expect(await sendAlerts(renter.userId, 'instant')).toBe(0);
    const [email] = await outboxFor(renter.email);
    expect(email!.subject).toMatch(/^New home: 2 bed apartment in Tralee/);
    expect(email!.text).toContain(
      'A new home matches your search “County Kerry, 2+ beds, up to €1,500”',
    );
    expect(email!.text).toContain('€1,400 a month');
    expect(email!.fromAddress).toContain('alerts@');
    expect(email!.headers).toMatchObject({
      'List-Unsubscribe': expect.stringMatching(/^<http.*\/api\/alerts\/stop\/a\./),
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });

    // One click stops every alert, with no sign-in.
    const link = /<[^>]*\/api\/alerts\/stop\/([^>]+)>/.exec(
      email!.headers!['List-Unsubscribe']!,
    )![1]!;
    expect(await stopAlerts(link)).toMatchObject({
      stopped: expect.arrayContaining(['County Kerry, 2+ beds, up to €1,500']),
    });
    expect((await mySearches(renter.userId)).every((s) => s.frequency === 'off')).toBe(true);
  });

  it('sends a cheaper home to a search it now fits', async () => {
    const renter = await aRenter();
    await saveSearch(renter.userId, '/to-rent/kerry', 'max=1450');
    const { member, lettingId, listingId } = await aKerryHome('1,500');
    expect(await matchListing(listingId)).toBe(0);
    await saveLettingDetails(member, lettingId, { deposit: '1,000' });
    await recordRentCheck(member, lettingId, { lastLet: 'never' }, 145_000);
    expect(await queuedJobs('alerts_match')).toContainEqual({ listingId });
    expect(await matchListing(listingId)).toBe(1);
  });

  it('sends daily alerts at 8am in Ireland, not before', async () => {
    const renter = await aRenter();
    const saved = await saveSearch(renter.userId, '/to-rent/kerry/tralee', '');
    if (!saved || 'tooMany' in saved) throw new Error('not saved');
    await setFrequency(renter.userId, saved.id, 'daily');
    const { listingId } = await aKerryHome('1,300');
    await matchListing(listingId);
    expect(await sendDailyAlerts(new Date('2026-11-09T07:30:00Z'))).toBe(0);
    expect(await sendDailyAlerts(new Date('2026-11-09T08:05:00Z'))).toBeGreaterThanOrEqual(1);
    expect((await outboxFor(renter.email))[0]!.text).toContain('You get these once a day, at 8am.');
  });

  it('only accepts its own signed stop links', () => {
    const id = crypto.randomUUID();
    expect(readStopToken(stopToken('s', id))).toEqual({ scope: 's', searchId: id });
    const forged = stopToken('s', id).replace(/^s\./, 'a.');
    expect(readStopToken(forged)).toBeNull();
    expect(readStopToken('s.not-a-search.xxxxxxxx')).toBeNull();
  });

  it('M10: keeps saved searches in the renter’s zone, and deletes deliveries after 90 days', async () => {
    const renter = await aRenter();
    await saveSearch(renter.userId, '/to-rent/kerry', 'beds=1');
    const other = await aRenter();
    expect(await withRenter(other.userId, (tx) => tx.select().from(savedSearches))).toEqual([]);
    const { listingId } = await aKerryHome('1,350');
    await matchListing(listingId);
    await withSystem((tx) =>
      tx
        .update(alertDeliveries)
        .set({ matchedAt: sql`now() - interval '91 days'` })
        .where(eq(alertDeliveries.userId, renter.userId)),
    );
    await sweepMarketplace();
    expect(await withRenter(renter.userId, (tx) => tx.select().from(alertDeliveries))).toEqual([]);
  });
});
