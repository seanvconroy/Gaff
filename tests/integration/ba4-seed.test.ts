import { readMoreFacts } from '@/domain/lettings/more-facts';
import { and, count, eq, gt, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, withOrg, withSystem } from '@/db/client';
import {
  decisions,
  events,
  lettingPhotos,
  lettings,
  memberships,
  organisations,
  users,
  viewingSessions,
} from '@/db/schema';
import { goLiveNeeds } from '@/domain/lettings/setup';
import { placedPoint } from '@/domain/map/pin';
import { resetEnvForTests } from '@/lib/env';
import { checkListing } from '@/server/trust/checks';
import { findMember, type Member } from '@/server/auth/member';
import { publicHomePage, publicHomesForSearch } from '@/server/homes/public-homes';
import { goLiveGateFor, isShownOnGaff } from '@/server/lettings/go-live';
import { setHomePoint } from '@/server/lettings/location';
import { addPhoto } from '@/server/lettings/photos';
import { getLetting } from '@/server/lettings/queries';
import { seedTestCopy } from '@/server/dev/seed';
import { sweepFreshness } from '@/server/lettings/freshness';
import { seedListers } from '@/server/dev/seed-homes';
import { aPng } from '../fixtures/photos';
import { aRegisterEntry } from './helpers';

/**
 * BA-4: the test copy's seed, against the real database. The seeded homes are taken off Gaff
 * afterwards, so other tests' searches of Dublin, Galway and Cork see only their own homes.
 */

const emails = seedListers.map((lister) => lister.person.email);

async function seededMembers(): Promise<Member[]> {
  const rows = await db()
    .select({ userId: users.id, organisationId: memberships.organisationId })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .where(inArray(users.email, emails));
  const members = await Promise.all(rows.map((r) => findMember(r.userId, r.organisationId)));
  return members.filter((m): m is Member => m !== null);
}

/** Every row the seed writes for its listers, counted, so a second run can be compared. */
async function footprint() {
  const orgIds = (await seededMembers()).map((m) => m.organisationId);
  if (orgIds.length === 0) return null;
  return withSystem(async (tx) => {
    const tally = async (table: typeof lettings | typeof lettingPhotos | typeof viewingSessions) =>
      (await tx.select({ n: count() }).from(table).where(inArray(table.organisationId, orgIds)))[0]!
        .n;
    const [ev] = await tx
      .select({ n: count() })
      .from(events)
      .where(inArray(events.organisationId, orgIds));
    const [dec] = await tx
      .select({ n: count() })
      .from(decisions)
      .where(inArray(decisions.organisationId, orgIds));
    return {
      organisations: orgIds.length,
      lettings: await tally(lettings),
      photos: await tally(lettingPhotos),
      sessions: await tally(viewingSessions),
      events: ev!.n,
      decisions: dec!.n,
    };
  });
}

async function seededLettingIds(): Promise<string[]> {
  const ids: string[] = [];
  for (const member of await seededMembers()) {
    const rows = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ id: lettings.id })
        .from(lettings)
        .where(eq(lettings.organisationId, member.organisationId)),
    );
    ids.push(...rows.map((r) => r.id));
  }
  return ids;
}

beforeAll(async () => {
  // The sample register's two agencies, as the daily job's first refresh leaves them. The seed
  // refreshes the register itself only when they're missing, which would touch other tests'.
  await aRegisterEntry({
    licenceNumber: '001239',
    registeredName: 'Liffey Quay Estates Limited',
    tradingName: 'Liffey Quay',
    county: 'Dublin',
  });
  await aRegisterEntry({
    licenceNumber: '001236',
    registeredName: 'Corrib Homes Limited',
    county: 'Galway',
  });
});

afterAll(async () => {
  const ids = await seededLettingIds();
  if (ids.length === 0) return;
  await withSystem((tx) =>
    tx.update(lettings).set({ status: 'withdrawn' }).where(inArray(lettings.id, ids)),
  );
});

describe('BA-4: the test copy’s seed', () => {
  it('BA-4: never runs in production, and writes nothing there', async () => {
    // A production deployment's settings: real providers only (made-up values).
    const production = {
      GAFF_ENV: 'production',
      DEV_TOOLS: '0',
      CRON_SECRET: 'a-cron-secret-of-sixteen-or-more',
      DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_made_up',
      RESEND_WEBHOOK_SECRET: 'whsec_made_up',
      SMS_PROVIDER: 'sinch',
      SINCH_SERVICE_PLAN_ID: 'made-up',
      SINCH_API_TOKEN: 'made-up',
      SINCH_FROM: 'Gaff',
      AI_PROVIDER: 'bedrock',
      ANTHROPIC_API_KEY: '',
      IDENTITY_PROVIDER: 'none',
      INCOME_PROVIDER: 'none',
      PSRA_REGISTER_SOURCE: 'url',
      PSRA_REGISTER_URL: 'https://register.example.ie/register.csv',
      ADDRESS_SEARCH: 'off',
      PHOTO_STORE: 'supabase',
      SUPABASE_URL: 'https://made-up.supabase.example',
      SUPABASE_SERVICE_ROLE_KEY: 'made-up',
      TEST_EMAIL_RECIPIENTS: '',
      TEST_STAFF_EMAILS: '',
    };
    for (const [name, value] of Object.entries(production)) vi.stubEnv(name, value);
    resetEnvForTests();
    try {
      await expect(seedTestCopy()).rejects.toThrow('The seed never runs in production');
    } finally {
      vi.unstubAllEnvs();
      resetEnvForTests();
    }
    expect(await db().select().from(users).where(inArray(users.email, emails))).toEqual([]);
  });

  it('BA-4: seeds two confirmed agencies and a verified landlord, with nine live homes', async () => {
    const report = await seedTestCopy();
    expect(report).toMatchObject({
      listers: { created: 3, existing: 0, skipped: 0 },
      homes: { added: 9, existing: 0, finished: 0, closed: 0, notLive: 0 },
      pinsPlaced: 9,
      viewingTimesAdded: 18,
      registerLoaded: false,
    });
    expect(report.photosAdded).toBe(
      seedListers.flatMap((l) => l.homes).reduce((n, home) => n + home.photos.length, 0),
    );

    const members = await seededMembers();
    expect(members.map((m) => m.organisationKind).sort()).toEqual([
      'agency',
      'agency',
      'private_landlord',
    ]);
    const orgs = await db()
      .select()
      .from(organisations)
      .where(
        inArray(
          organisations.id,
          members.map((m) => m.organisationId),
        ),
      );
    for (const org of orgs) {
      if (org.kind === 'agency') {
        expect(org.confirmedAt, org.name).not.toBeNull();
        expect(['001236', '001239']).toContain(org.psraLicenceNumber);
      } else {
        expect(org.identityVerifiedAt).not.toBeNull();
      }
    }
  }, 120_000);

  it('BA-4: leaves every seeded home passing the checks a real go-live passes', async () => {
    const shown = new Map((await publicHomesForSearch()).map((home) => [home.home.ref, home]));
    let homes = 0;
    for (const member of await seededMembers()) {
      const { gate } = await goLiveGateFor(member);
      expect(gate).toEqual({ open: true });
      const lister = seedListers.find((l) =>
        member.organisationKind === 'private_landlord'
          ? l.kind === 'private_landlord'
          : l.kind === 'agency',
      )!;
      const rows = await withOrg(member.organisationId, (tx) =>
        tx
          .select({ id: lettings.id })
          .from(lettings)
          .where(eq(lettings.organisationId, member.organisationId)),
      );
      for (const { id } of rows) {
        homes += 1;
        const detail = (await getLetting(member, id))!;
        const address = detail.letting.addressLine1;
        expect(detail.letting.status, address).toBe('live');
        expect(
          goLiveNeeds({ ...detail.letting, rentCheckDone: detail.setup.rentCheckDone, gate }),
        ).toEqual([]);
        expect(detail.setup.criteriaSet, address).toBe(true);
        expect(isShownOnGaff(detail), address).toBe(true);
        // BA-10 (M29, M48): every check a home passes as it goes public, honestly: not held, and
        // clear when it's looked at again in full.
        expect(detail.letting.hiddenAt, address).toBeNull();
        expect(
          await checkListing({
            organisationId: member.organisationId,
            lettingId: id,
            part: 'all',
          }),
          address,
        ).toEqual({ outcome: 'clear' });
        expect(detail.photos.length, address).toBeGreaterThanOrEqual(3);
        // BA-14: what renters ask is in the further facts now (floor, heating and the rest),
        // with the free-text facts beside them: more than three in all, and four or more facts.
        const more = Object.keys(readMoreFacts(detail.letting.moreFacts)).length;
        expect(more, address).toBeGreaterThanOrEqual(4);
        expect(detail.facts.length + more, address).toBeGreaterThan(3);
        expect(placedPoint(detail.letting), address).not.toBeNull();
        expect(
          detail.sessions.filter((s) => s.startsAt > new Date()).length,
          address,
        ).toBeGreaterThanOrEqual(2);
        // Put live by its own member's decision (rule 1), with its event.
        const [decision] = await withOrg(member.organisationId, (tx) =>
          tx
            .select()
            .from(decisions)
            .where(and(eq(decisions.lettingId, id), eq(decisions.kind, 'confirm_setup'))),
        );
        expect(decision?.decidedBy, address).toBe(member.userId);
        // On Gaff: found by search, with a pin, and a public page with its photos.
        const ref = detail.letting.publicRef;
        expect(shown.get(ref)?.point, address).not.toBeNull();
        const page = await publicHomePage(ref);
        expect(page?.state, address).toBe('live');
        if (page?.state === 'live') expect(page.home.photos.length).toBeGreaterThanOrEqual(3);
        expect(lister).toBeDefined();
      }
      // The pin is where the lister put it, in the area its address names (M126).
      const pinned = await withOrg(member.organisationId, (tx) =>
        tx
          .select({ data: events.data })
          .from(events)
          .where(
            and(
              eq(events.organisationId, member.organisationId),
              eq(events.type, 'letting.point_set'),
            ),
          ),
      );
      expect(pinned.map((e) => (e.data as { check: string }).check)).toEqual(
        rows.map(() => 'inside'),
      );
    }
    expect(homes).toBe(9);
  });

  it('BA-4: runs again without changing anything', async () => {
    const before = await footprint();
    const report = await seedTestCopy();
    expect(report).toEqual({
      listers: { created: 0, existing: 3, skipped: 0 },
      homes: { added: 0, existing: 9, finished: 0, closed: 0, notLive: 0 },
      photosAdded: 0,
      pinsPlaced: 0,
      viewingTimesAdded: 0,
      registerLoaded: false,
    });
    expect(await footprint()).toEqual(before);
  });

  it('BA-4: keeps what a tester changed, and tops up viewing times later on', async () => {
    const [agency] = (await seededMembers()).filter((m) => m.organisationKind === 'agency');
    const [first, second] = await withOrg(agency!.organisationId, (tx) =>
      tx
        .select({ id: lettings.id })
        .from(lettings)
        .where(eq(lettings.organisationId, agency!.organisationId))
        .orderBy(lettings.createdAt),
    );
    // A tester adds a photo and moves a pin on one home, and closes another.
    const photosBefore = (await getLetting(agency!, first!.id))!.photos.length;
    expect((await addPhoto(agency!, first!.id, aPng([90, 140, 200]))).ok).toBe(true);
    const moved = { lat: 53.3251, lng: -6.2551 };
    expect((await setHomePoint(agency!, first!.id, moved)).ok).toBe(true);
    await withOrg(agency!.organisationId, (tx) =>
      tx.update(lettings).set({ status: 'withdrawn' }).where(eq(lettings.id, second!.id)),
    );

    // Ten days on, the next deploy.
    const later = new Date(Date.now() + 10 * 86_400_000);
    const report = await seedTestCopy(later);
    expect(report.homes).toMatchObject({ added: 0, closed: 1 });
    expect(report.photosAdded).toBe(0);
    expect(report.pinsPlaced).toBe(0);
    // Every live home had none ahead of then, so each gets two more.
    expect(report.viewingTimesAdded).toBe(8 * 2);

    const detail = (await getLetting(agency!, first!.id))!;
    expect(detail.photos).toHaveLength(photosBefore + 1);
    expect(placedPoint(detail.letting)).toEqual(moved);
    expect((await getLetting(agency!, second!.id))!.letting.status).toBe('withdrawn');
    const ahead = await withOrg(agency!.organisationId, (tx) =>
      tx
        .select({ id: viewingSessions.id })
        .from(viewingSessions)
        .where(and(eq(viewingSessions.lettingId, first!.id), gt(viewingSessions.startsAt, later))),
    );
    expect(ahead).toHaveLength(2);
  }, 60_000);

  it('M49 (BA-13): each run counts as its listers saying every home is still available', async () => {
    const members = await seededMembers();
    const [agency] = members.filter((m) => m.organisationKind === 'agency');
    const [live] = await withOrg(agency!.organisationId, (tx) =>
      tx
        .select({ id: lettings.id, ref: lettings.publicRef })
        .from(lettings)
        .where(
          and(eq(lettings.organisationId, agency!.organisationId), eq(lettings.status, 'live')),
        )
        .limit(1),
    );
    // A home that stepped back while the test copy sat undeployed.
    await withOrg(agency!.organisationId, (tx) =>
      tx.update(lettings).set({ staleAt: new Date() }).where(eq(lettings.id, live!.id)),
    );
    expect(await publicHomePage(live!.ref)).toBeNull();
    // Forty days on, the next deploy: every home is confirmed, and that one is back.
    const later = new Date(Date.now() + 40 * 86_400_000);
    await seedTestCopy(later);
    expect(await publicHomePage(live!.ref)).not.toBeNull();
    for (const member of members) {
      expect(
        await sweepFreshness(new Date(later.getTime() + 86_400_000), member.organisationId),
      ).toEqual({
        asked: 0,
        steppedBack: 0,
      });
    }
  }, 60_000);
});
