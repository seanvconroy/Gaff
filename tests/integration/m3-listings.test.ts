import { and, desc, eq, like } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg, withPublic } from '@/db/client';
import {
  devOutbox,
  events,
  lettings,
  listingHolds,
  listingRevisions,
  listings,
  publicListings,
} from '@/db/schema';
import { saveDescription, saveLettingDetails } from '@/server/listings/editor';
import { followLetting } from '@/server/listings/follow';
import { confirmAvailableByLink, sweepFreshness } from '@/server/listings/freshness';
import { heldListings, resolveHold } from '@/server/listings/holds';
import { closeEnquiries, listingsOverview, relistHome, setPaused } from '@/server/listings/manage';
import { publishListing } from '@/server/listings/publish';
import { closeLetting } from '@/server/lettings/close';
import { createTestMember } from './helpers';
import { A_DESCRIPTION, aCheckedLandlord, aListableLetting, aStaffMember } from './listing-helpers';

async function publicRow(lettingId: string, organisationId: string) {
  const [listing] = await withOrg(organisationId, (tx) =>
    tx.select().from(listings).where(eq(listings.lettingId, lettingId)),
  );
  const [row] = await withPublic((tx) =>
    tx.select().from(publicListings).where(eq(publicListings.listingId, listing!.id)),
  );
  return { listing: listing!, row: row ?? null };
}

describe('M48: publishing a listing', () => {
  it('names what’s missing, then goes live with its public copy, a revision and an event', async () => {
    const unchecked = await createTestMember({ kind: 'landlord' });
    const { lettingId: blocked } = await aListableLetting(unchecked);
    const refused = await publishListing(unchecked, blocked, { declare: false });
    expect(refused.outcome).toBe('problems');
    expect(refused.outcome === 'problems' && refused.problems.map((p) => p.section)).toEqual([
      'checks',
      'checks',
      'publish',
    ]);

    const member = await aCheckedLandlord();
    const { lettingId } = await aListableLetting(member);
    const result = await publishListing(member, lettingId, { declare: true });
    expect(result).toMatchObject({
      outcome: 'live',
      slug: expect.stringMatching(/^2-bed-apartment-in-ranelagh/),
    });

    const { listing, row } = await publicRow(lettingId, member.organisationId);
    expect(listing).toMatchObject({ status: 'live', revision: 1, assignedTo: member.userId });
    expect(row).toMatchObject({
      status: 'live',
      title: '2 bed apartment in Ranelagh, Dublin 6',
      addressShown: 'Ranelagh Road, Ranelagh, Dublin 6',
      rentCents: 185_000,
      depositCents: 185_000,
      petsConsidered: false,
      letter: {
        kind: 'landlord',
        name: 'Mary',
        badges: [expect.stringMatching(/^Identity checked by Gaff/)],
      },
    });
    expect((row!.photos as unknown[]).length).toBe(3);
    expect(JSON.stringify(row)).not.toMatch(/F2X3|12 Ranelagh/);

    const types = await withOrg(member.organisationId, (tx) =>
      tx.select({ type: events.type }).from(events).where(like(events.type, 'listing.%')),
    );
    expect(types.map((t) => t.type)).toEqual(['listing.declared', 'listing.published']);
    const revisions = await withOrg(member.organisationId, (tx) =>
      tx.select().from(listingRevisions),
    );
    expect(revisions).toHaveLength(1);
  });

  it('M51: edits go live at once; protected grounds can’t be added to a live listing', async () => {
    const member = await aCheckedLandlord();
    const { lettingId, description } = await aListableLetting(member);
    await publishListing(member, lettingId, { declare: true });
    expect(await saveDescription(member, lettingId, `${description} No HAP.`)).toMatchObject({
      ok: false,
      errors: { description: expect.stringMatching(/housing assistance/) },
    });
    await saveLettingDetails(member, lettingId, { deposit: '1,000' });
    const { listing, row } = await publicRow(lettingId, member.organisationId);
    expect(row!.depositCents).toBe(100_000);
    expect(row!.description).toBe(description);
    expect(listing.revision).toBe(2);
  });
});

describe('M29, M97, M98: risky listings wait for a person at Gaff', () => {
  it('holds a listing that asks for money before a viewing; staff release it', async () => {
    const member = await aCheckedLandlord();
    const { lettingId } = await aListableLetting(member, [11, 12, 13]);
    await saveDescription(
      member,
      lettingId,
      `${A_DESCRIPTION} I am working abroad, so please send the deposit before the viewing.`,
    );
    expect(await publishListing(member, lettingId, { declare: true })).toEqual({
      outcome: 'held',
      reasons: ['scam_wording'],
    });
    expect((await publicRow(lettingId, member.organisationId)).row).toBeNull();

    const staff = await aStaffMember();
    const held = (await heldListings(staff)).find((h) => h.lettingId === lettingId)!;
    expect(held.reasons).toEqual(['scam_wording']);
    await resolveHold(staff, held.holdId, { outcome: 'released' });
    expect((await publicRow(lettingId, member.organisationId)).row?.status).toBe('live');
  });

  it('holds a photo copied from another letter’s listing; removal sends a statement of reasons', async () => {
    const first = await aCheckedLandlord();
    const { lettingId: original } = await aListableLetting(first, [21, 22, 23]);
    await publishListing(first, original, { declare: true });

    const copier = await aCheckedLandlord();
    const { lettingId } = await aListableLetting(copier, [21, 24, 25]);
    const held = await publishListing(copier, lettingId, { declare: true });
    expect(held).toEqual({ outcome: 'held', reasons: ['photo_reused'] });

    const staff = await aStaffMember();
    const hold = (await heldListings(staff)).find((h) => h.lettingId === lettingId)!;
    await resolveHold(staff, hold.holdId, { outcome: 'removed', reason: 'scam' });
    const { listing, row } = await publicRow(lettingId, copier.organisationId);
    expect(listing.status).toBe('withdrawn');
    expect(row).toBeNull();
    const [mail] = await db()
      .select({ subject: devOutbox.subject, text: devOutbox.text })
      .from(devOutbox)
      .where(eq(devOutbox.toAddress, copier.email))
      .orderBy(desc(devOutbox.createdAt))
      .limit(1);
    expect(mail!.subject).toMatch(/We’ve removed your listing/);
    expect(mail!.text).toMatch(/signs of a rental scam/);
    expect(mail!.text).toMatch(/A different person at Gaff will review it/);
    const [resolved] = await withOrg(copier.organisationId, (tx) => tx.select().from(listingHolds));
    expect(resolved).toMatchObject({ outcome: 'removed', resolvedBy: staff.userId });
  });
});

describe('M49, M50, M52: a listing stays fresh and follows its letting', () => {
  it('reminds after 14 days, pauses after 17, and the link puts it back live', async () => {
    const member = await aCheckedLandlord();
    const { lettingId } = await aListableLetting(member, [31, 32, 33]);
    await publishListing(member, lettingId, { declare: true });
    const day = 86_400_000;
    const published = (await publicRow(lettingId, member.organisationId)).listing.confirmedAt!;

    const later = (days: number) => new Date(published.getTime() + days * day);
    expect((await sweepFreshness(later(15))).reminded).toBeGreaterThanOrEqual(1);
    const [reminder] = await db()
      .select({ text: devOutbox.text })
      .from(devOutbox)
      .where(
        and(
          eq(devOutbox.toAddress, member.email),
          like(devOutbox.subject, 'Is % still available?'),
        ),
      );
    const [, organisationId, listingId, token] =
      /\/listings\/confirm\/([^/]+)\/([^/]+)\/([A-Za-z0-9_-]+)/.exec(reminder!.text)!;

    await sweepFreshness(later(18));
    expect((await publicRow(lettingId, member.organisationId)).listing.status).toBe('paused');
    expect((await publicRow(lettingId, member.organisationId)).row).toBeNull();

    expect(await confirmAvailableByLink(organisationId!, listingId!, 'wrong-token')).toBe(
      'invalid',
    );
    expect(await confirmAvailableByLink(organisationId!, listingId!, token!)).toBe('confirmed');
    expect((await publicRow(lettingId, member.organisationId)).row?.status).toBe('live');
  });

  it('is "Let agreed" once the offer is accepted, then "Let"; a letter can pause it', async () => {
    const member = await aCheckedLandlord();
    const { lettingId } = await aListableLetting(member, [41, 42, 43]);
    await publishListing(member, lettingId, { declare: true });
    await setPaused(member, lettingId, true);
    expect((await publicRow(lettingId, member.organisationId)).row).toBeNull();
    await setPaused(member, lettingId, false);

    await withOrg(member.organisationId, (tx) => followLetting(tx, lettingId, 'offer_accepted'));
    expect((await publicRow(lettingId, member.organisationId)).row?.status).toBe('let_agreed');
    await withOrg(member.organisationId, (tx) => followLetting(tx, lettingId, 'let'));
    const { listing, row } = await publicRow(lettingId, member.organisationId);
    expect(listing.status).toBe('let');
    expect(row?.status).toBe('let');
  });

  it('withdrawing the letting withdraws the listing; the home can be let again', async () => {
    const member = await aCheckedLandlord();
    const { lettingId } = await aListableLetting(member, [51, 52, 53]);
    await publishListing(member, lettingId, { declare: true });
    await closeLetting(member, lettingId, 'withdrawn');
    expect((await publicRow(lettingId, member.organisationId)).row?.status).toBe('withdrawn');

    const { lettingId: again } = await relistHome(member, lettingId);
    const overview = await listingsOverview(member);
    expect(overview.find((l) => l.lettingId === again)).toMatchObject({
      status: 'draft',
      slug: null,
    });
  });

  it('M52: enquiries close at the time the letter set', async () => {
    const member = await aCheckedLandlord();
    const { lettingId } = await aListableLetting(member, [61, 62, 63]);
    await publishListing(member, lettingId, { declare: true });
    const soon = new Date(Date.now() + 60_000);
    await saveLettingDetails(member, lettingId, {
      deposit: '1,850',
      enquiriesCloseAt: soon.toISOString(),
    });
    await withOrg(member.organisationId, (tx) =>
      tx
        .update(lettings)
        .set({ enquiriesCloseAt: new Date(Date.now() - 1000) })
        .where(eq(lettings.id, lettingId)),
    );
    await closeEnquiries({ organisationId: member.organisationId, lettingId });
    expect((await publicRow(lettingId, member.organisationId)).row?.status).toBe(
      'enquiries_closed',
    );
  });
});
