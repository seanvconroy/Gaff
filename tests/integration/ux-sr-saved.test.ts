import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg, withPerson, withSystem } from '@/db/client';
import {
  devOutbox,
  events,
  lettings,
  profileEvents,
  renterProfiles,
  savedHomes,
  savedSearches,
} from '@/db/schema';
import { deleteProfile, profileForDownload, sweepProfiles } from '@/server/accounts/delete-profile';
import { findConfirmation, grantConfirmation } from '@/server/auth/confirm';
import { addPhoto } from '@/server/lettings/photos';
import { sendSearchAlerts, sweepEmailSearches } from '@/server/saved/alerts';
import { sendSavedSearchEmail } from '@/server/saved/emails';
import { removeSavedHome, saveHome, savedHomeRefs, savedHomesOf } from '@/server/saved/homes';
import {
  confirmSearch,
  keepsSearch,
  removeSavedSearch,
  saveSearchByEmail,
  saveSearchFor,
  savedSearchesOf,
  setSearchAlerts,
  stopAlerts,
} from '@/server/saved/searches';
import { aPng } from '../fixtures/photos';
import {
  aLiveLetting,
  createTestMember,
  createTestPerson,
  databaseError,
  type Member,
  queuedJobs,
} from './helpers';

const DAY = 86_400_000;

/** A live home on Gaff, with a photo, in a town no other test uses. */
async function aHomeOnGaff(member: Member, facts: Record<string, string> = {}) {
  const { lettingId } = await aLiveLetting(member, {
    addressLine1: '3 Quay Street',
    area: 'Westport',
    county: 'Mayo',
    eircode: '',
    ...facts,
  });
  await addPhoto(member, lettingId, aPng([36, 99, 168]));
  const [row] = await withOrg(member.organisationId, (tx) =>
    tx.select({ ref: lettings.publicRef }).from(lettings).where(eq(lettings.id, lettingId)),
  );
  return { lettingId, ref: row!.ref };
}

const WESTPORT = { where: 'westport', beds: 2, maxRent: 2000 };

/** The email jobs queued since `before`, as the worker would run them. */
async function sendQueuedEmails(): Promise<void> {
  for (const payload of await queuedJobs('send_saved_search_email')) {
    await sendSavedSearchEmail(payload);
  }
  await db().execute(sql`
    delete from graphile_worker._private_jobs j using graphile_worker._private_tasks t
    where t.id = j.task_id and t.identifier = 'send_saved_search_email'`);
}

const mailTo = (address: string) =>
  db().select().from(devOutbox).where(eq(devOutbox.toAddress, address));

const tokenIn = (text: string, path: 'confirm' | 'stop') => {
  const pattern =
    path === 'confirm' ? /\/alerts\/([A-Za-z0-9_-]{43})\n/ : /\/alerts\/([A-Za-z0-9_-]{43})\/stop/;
  return pattern.exec(text)?.[1] ?? '';
};

describe('UX-AC-5, UX-MT-14: saved homes and searches are the person’s own', () => {
  it.each(['saved_homes', 'saved_searches'])(
    'ADR-0016: %s is protected by row-level security, for the person alone',
    async (table) => {
      const { rows } = await db().execute<{
        enabled: boolean;
        forced: boolean;
        policy: string;
        using: string;
      }>(sql`
        select c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
          p.policyname as policy, p.qual as using
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        left join pg_policies p on p.tablename = c.relname and p.schemaname = n.nspname
        where n.nspname = 'public' and c.relname = ${table}`);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ enabled: true, forced: true, policy: 'person_only' });
      expect(rows[0]!.using).toContain('app.person_id');
      expect(rows[0]!.using).not.toContain('app.org_id');
      const { rows: columns } = await db().execute<{ column: string }>(sql`
        select column_name as column from information_schema.columns
        where table_schema = 'public' and table_name = ${table}`);
      expect(columns.map((row) => row.column)).not.toContain('organisation_id');
    },
  );

  it('UX-AC-5, UX-MT-14: no operator’s path can read who saved a home or a search, not even the home’s lister', async () => {
    const lister = await createTestMember();
    const { ref } = await aHomeOnGaff(lister);
    const renter = await createTestPerson();
    expect(await saveHome(renter.id, ref)).toBe(true);
    expect((await saveSearchFor(renter.id, WESTPORT)).ok).toBe(true);
    await saveSearchByEmail('someone.else@example.ie', { where: 'westport' });
    for (const organisationId of [
      lister.organisationId,
      (await createTestMember()).organisationId,
    ]) {
      const seen = await withOrg(organisationId, async (tx) => ({
        homes: await tx.select().from(savedHomes),
        asked: await tx.select().from(savedHomes).where(eq(savedHomes.homeRef, ref)),
        searches: await tx.select().from(savedSearches),
      }));
      expect(seen).toEqual({ homes: [], asked: [], searches: [] });
    }
    // A query with no scope at all: nothing.
    expect(await db().select().from(savedHomes)).toEqual([]);
    expect(await db().select().from(savedSearches)).toEqual([]);
    // Nor can an operator write one.
    expect(
      await databaseError(
        withOrg(lister.organisationId, (tx) =>
          tx.insert(savedHomes).values({ userId: renter.id, homeRef: ref }),
        ),
      ),
    ).toMatch(/row-level security/);
  });

  it('UX-AC-5: one person’s path reads their own, and nobody else’s; a search held by an email alone is nobody’s', async () => {
    const lister = await createTestMember();
    const { ref } = await aHomeOnGaff(lister);
    const first = await createTestPerson();
    const second = await createTestPerson();
    await saveHome(first.id, ref);
    await saveHome(second.id, ref);
    await saveSearchFor(first.id, WESTPORT);
    await saveSearchFor(second.id, WESTPORT);
    await saveSearchByEmail('nobody.in.particular@example.ie', WESTPORT);
    const seen = await withPerson(first.id, async (tx) => ({
      homes: await tx.select({ userId: savedHomes.userId }).from(savedHomes),
      searches: await tx
        .select({ userId: savedSearches.userId, email: savedSearches.email })
        .from(savedSearches),
    }));
    expect(seen).toEqual({
      homes: [{ userId: first.id }],
      searches: [{ userId: first.id, email: null }],
    });
  });

  it('UX-MT-14: the lister’s record says nothing about a home being saved', async () => {
    const lister = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(lister);
    const before = await withOrg(lister.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.lettingId, lettingId)),
    );
    await saveHome((await createTestPerson()).id, ref);
    const after = await withOrg(lister.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.lettingId, lettingId)),
    );
    expect(after).toEqual(before);
  });
});

describe('Saved: the heart', () => {
  it('saves a live home by its public reference, once, and makes them a renter', async () => {
    const lister = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(lister);
    const renter = await createTestPerson();
    expect(await saveHome(renter.id, ref)).toBe(true);
    expect(await saveHome(renter.id, ref)).toBe(true);
    expect(await savedHomeRefs(renter.id)).toEqual([ref]);
    const rows = await withSystem((tx) =>
      tx.select().from(savedHomes).where(eq(savedHomes.userId, renter.id)),
    );
    // Never the letting's own ID.
    expect(JSON.stringify(rows)).not.toContain(lettingId);
    const record = await withPerson(renter.id, (tx) =>
      tx.select().from(profileEvents).where(eq(profileEvents.userId, renter.id)),
    );
    expect(record.filter((row) => row.type === 'profile.home_saved')).toHaveLength(1);
    expect(record.find((row) => row.type === 'profile.home_saved')!.data).toEqual({});
    const [profile] = await withPerson(renter.id, (tx) =>
      tx.select().from(renterProfiles).where(eq(renterProfiles.userId, renter.id)),
    );
    expect(profile).toBeDefined();
  });

  it('keeps the same home when the letting is edited', async () => {
    const lister = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(lister);
    const renter = await createTestPerson();
    await saveHome(renter.id, ref);
    await withSystem((tx) =>
      tx
        .update(lettings)
        .set({ monthlyRentCents: 179_000, addressLine1: '3A Quay Street' })
        .where(eq(lettings.id, lettingId)),
    );
    const [saved] = await savedHomesOf(renter.id);
    expect(saved?.state).toBe('live');
    if (saved?.state === 'live') {
      expect(saved.home.home.addressLine1).toBe('3A Quay Street');
      expect(saved.home.home.monthlyRentCents).toBe(179_000);
    }
  });

  it('refuses anything but a live home’s reference', async () => {
    const lister = await createTestMember();
    const { lettingId } = await aHomeOnGaff(lister);
    const renter = await createTestPerson();
    expect(await saveHome(renter.id, lettingId)).toBe(false);
    expect(await saveHome(renter.id, 'ffffffffffff')).toBe(false);
    expect(await savedHomeRefs(renter.id)).toEqual([]);
  });

  it('a let home stays on Saved, marked, until it is removed', async () => {
    const lister = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(lister);
    const renter = await createTestPerson();
    await saveHome(renter.id, ref);
    await withSystem((tx) =>
      tx
        .update(lettings)
        .set({ status: 'let', letAt: new Date() })
        .where(eq(lettings.id, lettingId)),
    );
    const [saved] = await savedHomesOf(renter.id);
    expect(saved).toMatchObject({
      ref,
      state: 'let',
      title: expect.stringContaining('3 Quay Street'),
    });
    await removeSavedHome(renter.id, ref);
    expect(await savedHomesOf(renter.id)).toEqual([]);
    // A home taken off Gaff altogether is marked as gone.
    const other = await aHomeOnGaff(lister, { addressLine1: '9 Quay Street' });
    await saveHome(renter.id, other.ref);
    await withSystem((tx) =>
      tx.update(lettings).set({ onGaff: false }).where(eq(lettings.id, other.lettingId)),
    );
    expect(await savedHomesOf(renter.id)).toEqual([{ ref: other.ref, state: 'gone' }]);
  });
});

describe('UX-SR-10: saving a search', () => {
  it('UX-MT-13: signed in, the chips are kept on the profile, never the sentence', async () => {
    const renter = await createTestPerson();
    const result = await saveSearchFor(renter.id, {
      ...WESTPORT,
      words: '2-bed in Westport for me and my partner, I’m a nurse',
      stepFree: true,
    });
    expect(result).toEqual({ ok: true, kind: 'saved' });
    expect(await saveSearchFor(renter.id, { maxRent: 2000, beds: 2, where: 'westport' })).toEqual({
      ok: true,
      kind: 'already',
    });
    const { searches, alerts } = await savedSearchesOf(renter.id);
    expect(alerts).toBe(true);
    expect(searches.map((s) => s.filters)).toEqual([WESTPORT]);
    expect(await keepsSearch(renter.id, WESTPORT)).toBe(true);
    const [row] = await withSystem((tx) =>
      tx.select().from(savedSearches).where(eq(savedSearches.userId, renter.id)),
    );
    expect(JSON.stringify(row)).not.toMatch(/nurse|partner|stepFree/);
    expect(row!.email).toBeNull();
  });

  it('UX-SR-10: a search with no chips is not kept', async () => {
    const renter = await createTestPerson();
    expect(await saveSearchFor(renter.id, {})).toEqual({ ok: false, reason: 'nothing_to_keep' });
  });

  it('UX-SR-10: signed out, an email and nothing more; nothing is sent until it is confirmed', async () => {
    const email = `aoife.${Date.now()}@example.ie`;
    expect(await saveSearchByEmail('not an email', WESTPORT)).toEqual({
      ok: false,
      reason: 'email',
    });
    expect(await saveSearchByEmail(email.toUpperCase(), WESTPORT)).toEqual({
      ok: true,
      kind: 'check_email',
    });
    await sendQueuedEmails();
    const [confirm] = await mailTo(email);
    expect(confirm!.subject).toBe('Confirm your search on Gaff');
    expect(confirm!.text).toContain('Westport, Co. Mayo · 2 bedrooms · Up to €2,000 a month');
    // The job's payload held an ID only; the token and the address are read when it's sent.
    const [row] = await withSystem((tx) =>
      tx.select().from(savedSearches).where(eq(savedSearches.email, email)),
    );
    expect(row!.confirmedAt).toBeNull();
    expect(row!.userId).toBeNull();
    const token = tokenIn(confirm!.text, 'confirm');
    expect(row!.tokenHash).not.toContain(token);
    expect(row!.tokenSealed).not.toContain(token);

    // Unconfirmed, a new home that fits tells nobody.
    const lister = await createTestMember();
    await aHomeOnGaff(lister);
    await sendSearchAlerts();
    await sendQueuedEmails();
    expect(await mailTo(email)).toHaveLength(1);

    expect(await confirmSearch(token)).toEqual({ state: 'confirmed', filters: WESTPORT });
    expect(await confirmSearch('x'.repeat(43))).toEqual({ state: 'not_found' });
  });

  it('UX-SR-10: an unconfirmed search is dropped after a day, and a confirmed one after two years', async () => {
    const email = `ciara.${Date.now()}@example.ie`;
    await saveSearchByEmail(email, WESTPORT);
    await saveSearchByEmail(email, { where: 'westport' });
    await sendQueuedEmails();
    const [mail] = await mailTo(email);
    await confirmSearch(tokenIn(mail!.text, 'confirm'));
    const rows = () =>
      withSystem((tx) => tx.select().from(savedSearches).where(eq(savedSearches.email, email)));
    expect(await rows()).toHaveLength(2);
    await sweepEmailSearches(new Date(Date.now() + 2 * DAY));
    expect(await rows()).toHaveLength(1);
    await sweepEmailSearches(new Date(Date.now() + 2 * 366 * DAY));
    expect(await rows()).toHaveLength(0);
  });
});

describe('UX-SR-10, UX-MT-16: the alert', () => {
  it('UX-SR-10: a new home that fits goes out once, in one email, with "Stop these"; running the job again sends nothing', async () => {
    const renter = await createTestPerson();
    await saveSearchFor(renter.id, WESTPORT);
    const lister = await createTestMember();
    const { ref } = await aHomeOnGaff(lister, { addressLine1: '21 Bridge Street' });
    // Close isn't fit: too dear, so not sent.
    const dear = await aHomeOnGaff(lister, { addressLine1: '23 Bridge Street' });
    await withSystem((tx) =>
      tx.update(lettings).set({ monthlyRentCents: 240_000 }).where(eq(lettings.id, dear.lettingId)),
    );

    await sendSearchAlerts();
    await sendSearchAlerts();
    await sendQueuedEmails();
    const mail = await mailTo(renter.email);
    expect(mail).toHaveLength(1);
    expect(mail[0]!.subject).toBe(
      'A new home fits your search: 21 Bridge Street, Westport, Co. Mayo',
    );
    expect(mail[0]!.text).toContain(`/homes/${ref}`);
    expect(mail[0]!.text).not.toContain('23 Bridge Street');
    expect(mail[0]!.text).toMatch(
      /Stop these: http:\/\/localhost:3000\/alerts\/[A-Za-z0-9_-]{43}\/stop/,
    );
    expect(mail[0]!.html).toContain('Stop these');

    // The next day, each home once: the same home isn't told again.
    await sendSearchAlerts(new Date(Date.now() + DAY));
    await sendQueuedEmails();
    expect(await mailTo(renter.email)).toHaveLength(1);
  });

  it('UX-SR-10: at most one email a day, whatever comes up', async () => {
    const renter = await createTestPerson();
    await saveSearchFor(renter.id, WESTPORT);
    await saveSearchFor(renter.id, { where: 'westport' });
    const lister = await createTestMember();
    await aHomeOnGaff(lister, { addressLine1: '31 Bridge Street' });
    await sendSearchAlerts();
    await aHomeOnGaff(lister, { addressLine1: '33 Bridge Street' });
    await sendSearchAlerts();
    await sendQueuedEmails();
    const today = await mailTo(renter.email);
    expect(today).toHaveLength(1);
    // Two searches found the first home: it is in the one email once.
    expect(today[0]!.text.match(/31 Bridge Street/g)).toHaveLength(1);
    await sendSearchAlerts(new Date(Date.now() + DAY));
    await sendQueuedEmails();
    const both = await mailTo(renter.email);
    expect(both).toHaveLength(2);
    expect(both.map((m) => m.text).join('\n')).toContain('33 Bridge Street');
  });

  it('UX-SR-10: "Stop these" from an email deletes a search held by an email alone, at once', async () => {
    const email = `orla.${Date.now()}@example.ie`;
    await saveSearchByEmail(email, WESTPORT);
    await sendQueuedEmails();
    await confirmSearch(tokenIn((await mailTo(email))[0]!.text, 'confirm'));
    const lister = await createTestMember();
    await aHomeOnGaff(lister, { addressLine1: '41 Bridge Street' });
    await sendSearchAlerts();
    await sendQueuedEmails();
    const alert = (await mailTo(email)).find((m) => m.subject.startsWith('A new home'))!;
    expect(await stopAlerts(tokenIn(alert.text, 'stop'))).toEqual({
      state: 'stopped',
      held: 'email',
    });
    expect(
      await withSystem((tx) =>
        tx.select().from(savedSearches).where(eq(savedSearches.email, email)),
      ),
    ).toEqual([]);
    expect(await stopAlerts(tokenIn(alert.text, 'stop'))).toEqual({ state: 'not_found' });
  });

  it('UX-SR-10: "Stop these" on a profile switches alerts off; Profile switches them back on', async () => {
    const renter = await createTestPerson();
    await saveSearchFor(renter.id, WESTPORT);
    const lister = await createTestMember();
    await aHomeOnGaff(lister, { addressLine1: '51 Bridge Street' });
    await sendSearchAlerts();
    await sendQueuedEmails();
    const [alert] = await mailTo(renter.email);
    expect(await stopAlerts(tokenIn(alert!.text, 'stop'))).toEqual({
      state: 'stopped',
      held: 'profile',
    });
    expect((await savedSearchesOf(renter.id)).alerts).toBe(false);
    await aHomeOnGaff(lister, { addressLine1: '53 Bridge Street' });
    await sendSearchAlerts(new Date(Date.now() + DAY));
    await sendQueuedEmails();
    expect(await mailTo(renter.email)).toHaveLength(1);
    await setSearchAlerts(renter.id, true);
    expect((await savedSearchesOf(renter.id)).alerts).toBe(true);
  });

  it('UX-MT-16: nothing about who was told reaches any organisation', async () => {
    const lister = await createTestMember();
    const renter = await createTestPerson();
    await saveSearchFor(renter.id, WESTPORT);
    const { lettingId } = await aHomeOnGaff(lister, { addressLine1: '61 Bridge Street' });
    const before = await withOrg(lister.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.lettingId, lettingId)),
    );
    await sendSearchAlerts();
    await sendQueuedEmails();
    const after = await withOrg(lister.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.lettingId, lettingId)),
    );
    expect(after).toEqual(before);
  });
});

describe('Profile: removing searches, and rule 9', () => {
  it('UX-SR-10: a search is removed from Profile at once', async () => {
    const renter = await createTestPerson();
    await saveSearchFor(renter.id, WESTPORT);
    const [search] = (await savedSearchesOf(renter.id)).searches;
    // Someone else can't remove it.
    await removeSavedSearch((await createTestPerson()).id, search!.id);
    expect((await savedSearchesOf(renter.id)).searches).toHaveLength(1);
    await removeSavedSearch(renter.id, search!.id);
    expect((await savedSearchesOf(renter.id)).searches).toEqual([]);
  });

  it('UX-PF-6: deleting the profile deletes saved homes and searches at once', async () => {
    const lister = await createTestMember();
    const { ref } = await aHomeOnGaff(lister);
    const renter = await createTestPerson();
    await saveHome(renter.id, ref);
    await saveSearchFor(renter.id, WESTPORT);
    const download = await profileForDownload(renter);
    expect(download.saved.homes.map((h) => h.ref)).toEqual([ref]);
    expect(download.saved.searches.map((s) => s.filters)).toEqual([WESTPORT]);
    const grant = await grantConfirmation(renter.id, 'delete_profile', 'email_code');
    await deleteProfile(renter, (await findConfirmation(renter.id, 'delete_profile', grant))!);
    const left = await withSystem(async (tx) => [
      ...(await tx.select().from(savedHomes).where(eq(savedHomes.userId, renter.id))),
      ...(await tx.select().from(savedSearches).where(eq(savedSearches.userId, renter.id))),
    ]);
    expect(left).toEqual([]);
  });

  it('UX-PF-7: a profile unused for two years goes with its saved homes and searches', async () => {
    const lister = await createTestMember();
    const { ref } = await aHomeOnGaff(lister);
    const renter = await createTestPerson();
    await saveHome(renter.id, ref);
    await saveSearchFor(renter.id, WESTPORT);
    const longAgo = new Date(Date.now() - (2 * 365 + 40) * DAY);
    await withSystem((tx) =>
      tx
        .update(renterProfiles)
        .set({ lastUsedAt: longAgo, deletionNoticeSentAt: new Date(Date.now() - 31 * DAY) })
        .where(eq(renterProfiles.userId, renter.id)),
    );
    await sweepProfiles();
    const left = await withSystem(async (tx) => [
      ...(await tx.select().from(savedHomes).where(eq(savedHomes.userId, renter.id))),
      ...(await tx.select().from(savedSearches).where(eq(savedSearches.userId, renter.id))),
    ]);
    expect(left).toEqual([]);
  });
});
