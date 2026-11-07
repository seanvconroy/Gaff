import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg, withPublic, withStaff, withSystem } from '@/db/client';
import {
  devOutbox,
  listings,
  moderationActions,
  moderationCases,
  organisations,
  publicListings,
  reports,
} from '@/db/schema';
import { publishListing } from '@/server/listings/publish';
import { submitReport, REPORTS_PER_DAY } from '@/server/moderation/reports';
import { appealDecision, decideCase, openCases, restoreAccount } from '@/server/moderation/review';
import { UserFacingError } from '@/server/errors';
import { sweepMarketplace } from '@/server/retention/marketplace';
import type { Member } from './helpers';
import { aCheckedLandlord, aListableLetting, aStaffMember } from './listing-helpers';

/** M96 to M98, M106, M107: reports, review and statements of reasons. */

async function aLiveListing(member?: Member) {
  const landlord = member ?? (await aCheckedLandlord());
  const { lettingId } = await aListableLetting(landlord);
  const published = await publishListing(landlord, lettingId, { declare: true });
  if (published.outcome !== 'live') throw new Error(`not live: ${published.outcome}`);
  const [row] = await withOrg(landlord.organisationId, (tx) =>
    tx.select().from(listings).where(eq(listings.lettingId, lettingId)),
  );
  return { member: landlord, lettingId, slug: published.slug, listingId: row!.id };
}

let device = 0;
const report = (slug: string, values: Record<string, string>, ip?: string) => {
  device += 1;
  return submitReport({
    slug,
    values: { details: '', email: '', ...values },
    ip: ip ?? `198.51.100.${device % 250}`,
    userAgent: `Mozilla/5.0 test device ${device}`,
    userId: null,
  });
};

async function listingStatus(member: Member, listingId: string) {
  const [row] = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ status: listings.status, pauseReason: listings.pauseReason })
      .from(listings)
      .where(eq(listings.id, listingId)),
  );
  return row!;
}

// Staff-zone tables are hidden from everyone else, the table owner included: read as the system.
async function caseFor(listingId: string) {
  const [row] = await withSystem((tx) =>
    tx.select().from(moderationCases).where(eq(moderationCases.listingId, listingId)),
  );
  return row;
}

describe('M96, M97: reports', () => {
  it('opens a case with a target, and acknowledges the reporter at once', async () => {
    const { slug, listingId } = await aLiveListing();
    const email = `reporter.${Date.now()}@example.ie`;
    const result = await report(slug, { reason: 'misleading', email, details: 'No balcony.' });
    expect(result).toMatchObject({ ok: true, reviewBy: expect.any(Date) });
    const opened = await withStaff((await aStaffMember()).userId, (tx) =>
      tx.select().from(moderationCases).where(eq(moderationCases.listingId, listingId)),
    );
    expect(opened).toEqual([
      expect.objectContaining({ source: 'report', reasons: ['misleading'], status: 'open' }),
    ]);
    const [ack] = await db().select().from(devOutbox).where(eq(devOutbox.toAddress, email));
    expect(ack?.text).toContain('A person at Gaff will look at it by');
  });

  it('pauses a listing at once on strong scam signals, and tells the letter it was automatic', async () => {
    const { member, slug, listingId } = await aLiveListing();
    await report(slug, { reason: 'scam' });
    expect((await listingStatus(member, listingId)).status).toBe('live');
    await report(slug, { reason: 'scam' });
    expect(await listingStatus(member, listingId)).toEqual({
      status: 'paused',
      pauseReason: 'review',
    });
    const [visible] = await withPublic((tx) =>
      tx.select().from(publicListings).where(eq(publicListings.listingId, listingId)),
    );
    expect(visible).toBeUndefined();
    const [action] = await withSystem((tx) =>
      tx.select().from(moderationActions).where(eq(moderationActions.listingId, listingId)),
    );
    expect(action).toMatchObject({ action: 'pause_listing', automatic: 'yes', decidedBy: null });
  });

  it('M82: stops one device sending more than 10 reports a day', async () => {
    const { slug } = await aLiveListing();
    for (let i = 0; i < REPORTS_PER_DAY; i++) {
      await submitReport({
        slug,
        values: { reason: 'other', details: '', email: '' },
        ip: '203.0.113.99',
        userAgent: 'Mozilla/5.0 same device',
        userId: null,
      });
    }
    expect(
      await submitReport({
        slug,
        values: { reason: 'other', details: '', email: '' },
        ip: '203.0.113.99',
        userAgent: 'Mozilla/5.0 same device',
        userId: null,
      }),
    ).toMatchObject({ ok: false, refused: expect.stringMatching(/a lot of reports/) });
  });

  it('ADR-0017: letters never see reports or cases about them', async () => {
    const { member, slug } = await aLiveListing();
    await report(slug, { reason: 'offensive' });
    const seen = await withOrg(member.organisationId, async (tx) => ({
      reports: await tx.select().from(reports),
      cases: await tx.select().from(moderationCases),
    }));
    expect(seen).toEqual({ reports: [], cases: [] });
  });
});

describe('M98, M106: a person decides, with reasons', () => {
  it('restores an automatically paused listing when there’s nothing wrong', async () => {
    const { member, slug, listingId } = await aLiveListing();
    const email = `reporter.${Date.now()}@example.ie`;
    await report(slug, { reason: 'scam', email });
    await report(slug, { reason: 'scam' });
    const staff = await aStaffMember();
    const item = await caseFor(listingId);
    expect((await openCases(staff)).some((c) => c.id === item!.id)).toBe(true);
    await decideCase(staff, item!.id, 'no_action', 'other');
    expect((await listingStatus(member, listingId)).status).toBe('live');
    const outcome = await db().select().from(devOutbox).where(eq(devOutbox.toAddress, email));
    expect(outcome.map((m) => m.subject)).toContain(
      'What we decided about the listing you reported',
    );
    const [closed] = await withSystem((tx) =>
      tx.select().from(moderationCases).where(eq(moderationCases.id, item!.id)),
    );
    expect(closed).toMatchObject({
      status: 'closed',
      decision: 'no_action',
      decidedBy: staff.userId,
    });
    const [kept] = await withSystem((tx) =>
      tx.select().from(reports).where(eq(reports.caseId, item!.id)),
    );
    expect(kept?.deleteAfter).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('removes a listing with a statement of reasons and its ground, and records it', async () => {
    const { member, slug, listingId } = await aLiveListing();
    await report(slug, { reason: 'discrimination', details: 'Says no HAP in the photos.' });
    const staff = await aStaffMember();
    const item = await caseFor(listingId);
    await decideCase(staff, item!.id, 'remove_listing', 'discrimination');
    expect((await listingStatus(member, listingId)).status).toBe('withdrawn');
    const [action] = await withSystem((tx) =>
      tx
        .select()
        .from(moderationActions)
        .where(
          and(
            eq(moderationActions.caseId, item!.id),
            eq(moderationActions.action, 'remove_listing'),
          ),
        ),
    );
    expect(action).toMatchObject({
      reason: 'discrimination',
      ground: 'law',
      statementTemplate: 'listing_removed@2',
      decidedBy: staff.userId,
    });
    const statements = await db()
      .select()
      .from(devOutbox)
      .where(eq(devOutbox.subject, 'We’ve removed your listing for 12 Ranelagh Road'));
    expect(statements.at(-1)?.text).toContain('This rests on the Equal Status Acts 2000 to 2018.');
    expect(statements.at(-1)?.text).toContain(`/listings/appeal/${item!.id}`);
  });
});

describe('M107: account actions, and M98: appeals to someone else', () => {
  it('pauses an account’s listings and new ones, then a different person reverses it on appeal', async () => {
    const member = await aCheckedLandlord();
    const first = await aLiveListing(member);
    const second = await aLiveListing(member);
    await report(first.slug, { reason: 'scam' });
    const decider = await aStaffMember();
    const item = await caseFor(first.listingId);
    await decideCase(decider, item!.id, 'pause_account', 'scam');
    expect((await listingStatus(member, first.listingId)).status).toBe('paused');
    expect((await listingStatus(member, second.listingId)).status).toBe('paused');
    const [account] = await db()
      .select({ status: organisations.marketplaceStatus })
      .from(organisations)
      .where(eq(organisations.id, member.organisationId));
    expect(account?.status).toBe('paused');

    // Nothing of theirs goes live while the account is paused.
    const { lettingId } = await aListableLetting(member);
    await expect(publishListing(member, lettingId, { declare: true })).rejects.toThrow(
      UserFacingError,
    );

    expect(
      await appealDecision(member, item!.id, 'We are a real landlord; this was a mistake.'),
    ).toBe('appealed');
    const [appeal] = await withSystem((tx) =>
      tx.select().from(moderationCases).where(eq(moderationCases.appealOf, item!.id)),
    );
    await expect(decideCase(decider, appeal!.id, 'no_action', 'other')).rejects.toThrow(
      /someone else/i,
    );
    const other = await aStaffMember();
    await decideCase(other, appeal!.id, 'no_action', 'other');
    expect((await listingStatus(member, first.listingId)).status).toBe('live');
    expect((await listingStatus(member, second.listingId)).status).toBe('live');
  });

  it('restores an account from the list of restricted accounts', async () => {
    const member = await aCheckedLandlord();
    const { slug, listingId } = await aLiveListing(member);
    await report(slug, { reason: 'misleading' });
    const staff = await aStaffMember();
    await decideCase(staff, (await caseFor(listingId))!.id, 'suspend_account', 'misleading');
    expect((await listingStatus(member, listingId)).status).toBe('paused');
    await restoreAccount(staff, member.organisationId);
    expect((await listingStatus(member, listingId)).status).toBe('live');
  });
});

describe('Rule 9: reports are deleted 6 months after their case closes', () => {
  it('is done by the nightly job', async () => {
    const { slug, listingId } = await aLiveListing();
    await report(slug, { reason: 'other', email: 'someone@example.ie' });
    const staff = await aStaffMember();
    const item = await caseFor(listingId);
    await decideCase(staff, item!.id, 'no_action', 'other');
    const sevenMonths = new Date(Date.now() + 213 * 86_400_000);
    const swept = await sweepMarketplace(sevenMonths);
    expect(swept.reports).toBeGreaterThanOrEqual(1);
    const left = await withSystem((tx) =>
      tx.select().from(reports).where(eq(reports.caseId, item!.id)),
    );
    expect(left).toEqual([]);
  });
});
