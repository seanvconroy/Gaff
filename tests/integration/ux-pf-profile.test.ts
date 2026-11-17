import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg, withPerson, withSystem } from '@/db/client';
import {
  accessLinks,
  applications,
  events,
  profileEvents,
  profiles,
  renterEnquiries,
  renterProfiles,
  users,
} from '@/db/schema';
import { detailsToKeep } from '@/domain/profile/kept';
import { stoppedByConflict } from '@/server/accounts/conflict';
import type { SignedInPerson } from '@/server/accounts/contexts';
import { deleteProfile, profileForDownload, sweepProfiles } from '@/server/accounts/delete-profile';
import { sendAccountEmail } from '@/server/accounts/emails';
import { attachEnquiry, holdsEnquiryFor, ownEnquiries } from '@/server/accounts/enquiries';
import { profileEventCatalogue } from '@/server/accounts/profile-events';
import { readProfile } from '@/server/accounts/profile';
import {
  changeKeptPart,
  keepEntered,
  noteProfileUse,
  readRenterProfile,
  removeKeptPart,
  setKeeping,
} from '@/server/accounts/renter-profile';
import { resolveAccessLink } from '@/server/access/links';
import { ConfirmationNeeded, findConfirmation, grantConfirmation } from '@/server/auth/confirm';
import { holdingsOf } from '@/server/auth/member';
import { loadRenterPageFor } from '@/server/renter/answers';
import { enquiriesNeedingThem, enquiryRowsFor, openEnquiry } from '@/server/renter/enquiries';
import { sweepPersonalData } from '@/server/retention/sweep';
import {
  aLiveLetting,
  aRenterEnquires,
  createTestMember,
  createTestPerson,
  databaseError,
  type Member,
  peopleWhoApplied,
  queuedJobs,
} from './helpers';

const PERSON_TABLES = ['renter_profiles', 'renter_enquiries', 'profile_events'] as const;

const DAY = 86_400_000;

/** The application as its renter's own page loads it, and what may be kept from it. */
async function entered(member: Member, applicationId: string) {
  const page = await loadRenterPageFor(member.organisationId, applicationId);
  return detailsToKeep(page!.application);
}

const pointer = (member: Member, lettingId: string, applicationId: string) => ({
  applicationId,
  organisationId: member.organisationId,
  lettingId,
});

/** A renter who applied for a home, added it to their Enquiries and ticked "Keep my details". */
async function aRenterWhoKept() {
  const member = await createTestMember();
  const { lettingId, ids } = await peopleWhoApplied(member, [5200]);
  const applicationId = ids[0]!;
  const renter = await createTestPerson({ name: 'Aoife Byrne' });
  await attachEnquiry(renter.id, pointer(member, lettingId, applicationId));
  await keepEntered(renter.id, await entered(member, applicationId), {
    from: 'tick',
    applicationId,
  });
  return { member, lettingId, applicationId, renter };
}

async function confirmedFor(person: SignedInPerson) {
  const grant = await grantConfirmation(person.id, 'delete_profile', 'email_code');
  return (await findConfirmation(person.id, 'delete_profile', grant))!;
}

/** Every row, in every table that is a person's own, for one person. Read as the system. */
async function rowsOf(userId: string) {
  return withSystem(async (tx) => ({
    renterProfiles: await tx.select().from(renterProfiles).where(eq(renterProfiles.userId, userId)),
    renterEnquiries: await tx
      .select()
      .from(renterEnquiries)
      .where(eq(renterEnquiries.userId, userId)),
    profileEvents: await tx.select().from(profileEvents).where(eq(profileEvents.userId, userId)),
    profiles: await tx.select().from(profiles).where(eq(profiles.userId, userId)),
    users: await tx.select().from(users).where(eq(users.id, userId)),
  }));
}

describe('UX-AC-5, UX-PF-4: what a renter keeps is out of every operator’s reach', () => {
  it.each(PERSON_TABLES)(
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
      // The policy knows nothing of organisations: no organisation's setting opens it.
      expect(rows[0]!.using).toContain('app.person_id');
      expect(rows[0]!.using).not.toContain('app.org_id');
      const { rows: columns } = await db().execute<{ column: string }>(sql`
        select column_name as column from information_schema.columns
        where table_schema = 'public' and table_name = ${table}`);
      expect(columns.map((row) => row.column)).not.toContain('organisation_id');
    },
  );

  it('UX-AC-5: no operator’s path can read what a renter keeps, not even the home’s own lister', async () => {
    const { member, renter, applicationId } = await aRenterWhoKept();
    expect((await readRenterProfile(renter.id)).monthlyIncomeCents).toBe(520_000);
    const other = await createTestMember();
    for (const organisationId of [member.organisationId, other.organisationId]) {
      const seen = await withOrg(organisationId, async (tx) => ({
        kept: await tx.select().from(renterProfiles),
        keptAsked: await tx
          .select()
          .from(renterProfiles)
          .where(eq(renterProfiles.userId, renter.id)),
        enquiries: await tx.select().from(renterEnquiries),
        // Nor by joining from the application the lister does hold.
        joined: await tx
          .select({ userId: renterEnquiries.userId })
          .from(applications)
          .innerJoin(renterEnquiries, eq(renterEnquiries.applicationId, applications.id))
          .where(eq(applications.id, applicationId)),
        record: await tx.select().from(profileEvents),
      }));
      expect(seen).toEqual({ kept: [], keptAsked: [], enquiries: [], joined: [], record: [] });
    }
    // A query with no scope at all: nothing.
    expect(await db().select().from(renterProfiles)).toEqual([]);
    expect(await db().select().from(renterEnquiries)).toEqual([]);
    expect(await db().select().from(profileEvents)).toEqual([]);
  });

  it('UX-AC-5: an agency can’t read its own member’s renter profile', async () => {
    const admin = await createTestMember({ name: 'Ann Power' });
    const lister = await createTestMember();
    const { lettingId, ids } = await peopleWhoApplied(lister, [4100]);
    await attachEnquiry(admin.userId, pointer(lister, lettingId, ids[0]!));
    await keepEntered(admin.userId, await entered(lister, ids[0]!), {
      from: 'tick',
      applicationId: ids[0]!,
    });
    expect((await readRenterProfile(admin.userId)).exists).toBe(true);
    const asHerAgency = await withOrg(admin.organisationId, async (tx) => [
      ...(await tx.select().from(renterProfiles)),
      ...(await tx.select().from(renterEnquiries)),
      ...(await tx.select().from(profileEvents)),
    ]);
    expect(asHerAgency).toEqual([]);
  });

  it('UX-AC-5: an operator’s path cannot write, change or delete any of it', async () => {
    const { member, renter, applicationId, lettingId } = await aRenterWhoKept();
    const someone = await createTestPerson();
    const inserts = [
      (tx: Parameters<Parameters<typeof withOrg>[1]>[0]) =>
        tx.insert(renterProfiles).values({ userId: someone.id, monthlyIncomeCents: 1 }),
      (tx: Parameters<Parameters<typeof withOrg>[1]>[0]) =>
        tx.insert(renterEnquiries).values({
          userId: someone.id,
          applicationId: crypto.randomUUID(),
          listerOrganisationId: member.organisationId,
          lettingId,
        }),
      (tx: Parameters<Parameters<typeof withOrg>[1]>[0]) =>
        tx.insert(profileEvents).values({ userId: someone.id, type: 'profile.downloaded' }),
    ];
    for (const insert of inserts) {
      expect(await databaseError(withOrg(member.organisationId, (tx) => insert(tx)))).toMatch(
        /row-level security/,
      );
    }
    const touched = await withOrg(member.organisationId, async (tx) => [
      ...(await tx
        .update(renterProfiles)
        .set({ monthlyIncomeCents: 1 })
        .where(eq(renterProfiles.userId, renter.id))
        .returning({ id: renterProfiles.userId })),
      ...(await tx
        .delete(renterEnquiries)
        .where(eq(renterEnquiries.applicationId, applicationId))
        .returning({ id: renterEnquiries.userId })),
      ...(await tx
        .delete(profileEvents)
        .where(eq(profileEvents.userId, renter.id))
        .returning({ id: profileEvents.userId })),
    ]);
    expect(touched).toEqual([]);
    expect((await readRenterProfile(renter.id)).monthlyIncomeCents).toBe(520_000);
    expect(await ownEnquiries(renter.id)).toHaveLength(1);
  });

  it('UX-AC-5: one person’s path reads their own, and nobody else’s', async () => {
    const first = await aRenterWhoKept();
    const second = await aRenterWhoKept();
    const seen = await withPerson(first.renter.id, async (tx) => ({
      kept: await tx.select({ userId: renterProfiles.userId }).from(renterProfiles),
      enquiries: await tx.select({ userId: renterEnquiries.userId }).from(renterEnquiries),
      record: await tx.selectDistinct({ userId: profileEvents.userId }).from(profileEvents),
      asked: await tx
        .select()
        .from(renterProfiles)
        .where(eq(renterProfiles.userId, second.renter.id)),
    }));
    expect(seen).toEqual({
      kept: [{ userId: first.renter.id }],
      enquiries: [{ userId: first.renter.id }],
      record: [{ userId: first.renter.id }],
      asked: [],
    });
  });

  it('UX-PF-4: the lister’s copy of an application says nothing about who has a profile', async () => {
    const { rows } = await db().execute<{ column: string }>(sql`
      select column_name as column from information_schema.columns
      where table_schema = 'public' and table_name = 'applications'`);
    const columns = rows.map((row) => row.column);
    expect(columns).not.toContain('user_id');
    expect(columns.filter((column) => /profile|verified|kept/.test(column))).toEqual([]);
  });
});

describe('UX-PF-2: keeping what a renter enters', () => {
  it('UX-RN-13: ticking "Keep my details" keeps their answers and income, and makes them a renter', async () => {
    const { renter, applicationId } = await aRenterWhoKept();
    const kept = await readRenterProfile(renter.id);
    expect(kept).toMatchObject({
      exists: true,
      keepsDetails: true,
      answers: { occupants: 1, hasPets: false },
      earning: 'employed',
      monthlyIncomeCents: 520_000,
      // Q12: the number that came with the Daft enquiry was never theirs to reuse.
      mobile: null,
    });
    expect(kept.incomeAt).toBeInstanceOf(Date);
    expect((await readProfile(renter.id)).rentingSince).toBeInstanceOf(Date);
    expect((await holdingsOf(renter.id)).contexts.map((context) => context.key)).toEqual([
      'renting',
    ]);
    const record = await withPerson(renter.id, (tx) =>
      tx.select({ type: profileEvents.type, data: profileEvents.data }).from(profileEvents),
    );
    expect(record).toEqual([
      { type: 'profile.enquiry_added', data: { applicationId } },
      {
        type: 'profile.details_kept',
        data: { from: 'tick', applicationId, mobile: false, answers: true, income: true },
      },
    ]);
  });

  it('UX-PF-2: with keeping switched off, nothing new is kept, and what is there stays', async () => {
    const { renter } = await aRenterWhoKept();
    await setKeeping(renter.id, false);
    // A second home, let by someone else.
    const member = await createTestMember();
    const { lettingId, ids } = await peopleWhoApplied(member, [6100]);
    await attachEnquiry(renter.id, pointer(member, lettingId, ids[0]!));
    const kept = await keepEntered(renter.id, await entered(member, ids[0]!), {
      from: 'application',
      applicationId: ids[0]!,
    });
    expect(kept).toBe(false);
    expect(await readRenterProfile(renter.id)).toMatchObject({
      keepsDetails: false,
      monthlyIncomeCents: 520_000,
    });
    // Switched back on, the next application is kept, with its own date.
    await setKeeping(renter.id, true);
    await keepEntered(renter.id, await entered(member, ids[0]!), {
      from: 'application',
      applicationId: ids[0]!,
    });
    expect((await readRenterProfile(renter.id)).monthlyIncomeCents).toBe(610_000);
  });

  it('rule 2: a profile never writes to an application: a second home’s lister holds only what was sent there', async () => {
    const { renter } = await aRenterWhoKept();
    const lister = await createTestMember();
    const { lettingId } = await aLiveLetting(lister);
    const secondId = await aRenterEnquires(lister, 1);
    await attachEnquiry(renter.id, pointer(lister, lettingId, secondId));
    const [second] = await withOrg(lister.organisationId, (tx) =>
      tx.select().from(applications).where(eq(applications.id, secondId)),
    );
    // The renter keeps an income and answers. Nothing of them is on the second application.
    expect(second).toMatchObject({
      earning: null,
      monthlyIncomeCents: null,
      answers: null,
      answersAt: null,
    });
  });

  it('Profile: each row can be changed and removed, and only by the profile’s own rules', async () => {
    const { renter } = await aRenterWhoKept();
    expect(await changeKeptPart(renter.id, 'mobile', { mobile: 'ring me' })).toEqual({
      ok: false,
      errors: { mobile: 'Enter a mobile number, like 087 123 4567.' },
    });
    expect(await changeKeptPart(renter.id, 'mobile', { mobile: '087 123 4567' })).toEqual({
      ok: true,
    });
    expect(
      await changeKeptPart(renter.id, 'income', {
        earning: 'self_employed',
        monthlyIncome: '4,800',
      }),
    ).toEqual({ ok: true });
    expect(
      await changeKeptPart(renter.id, 'answers', { occupants: '3', hasPets: '', stayMonths: '12' }),
    ).toEqual({ ok: true });
    expect(await readRenterProfile(renter.id)).toMatchObject({
      mobile: '087 123 4567',
      earning: 'self_employed',
      monthlyIncomeCents: 480_000,
      // The form is the whole row: pets was left blank, so it is no longer kept.
      answers: { occupants: 3, stayMonths: 12 },
    });
    await removeKeptPart(renter.id, 'income');
    await removeKeptPart(renter.id, 'mobile');
    expect(await readRenterProfile(renter.id)).toMatchObject({
      mobile: null,
      earning: null,
      monthlyIncomeCents: null,
      incomeAt: null,
      answers: { occupants: 3, stayMonths: 12 },
    });
  });
});

describe('UX-RH-1, UX-RH-3, UX-RH-4: a renter’s Enquiries', () => {
  it('UX-RH-1: each home they asked about, with where they stand, and those that need them first', async () => {
    const lister = await createTestMember({ organisation: 'Halcyon Lettings' });
    const { lettingId, ids } = await peopleWhoApplied(lister, [5200]);
    const other = await createTestMember({ organisation: 'Rowan & Byrne' });
    const second = await aLiveLetting(other, { addressLine1: '4 Harbour View' });
    const secondId = await aRenterEnquires(other, 1);
    const renter = await createTestPerson();
    await attachEnquiry(renter.id, pointer(lister, lettingId, ids[0]!));
    await attachEnquiry(renter.id, pointer(other, second.lettingId, secondId));
    const rows = await enquiryRowsFor(renter.id);
    expect(
      rows.map(({ address, line, needsYou, over, view }) => ({
        address,
        line,
        needsYou,
        over,
        view,
      })),
    ).toEqual([
      {
        address: '4 Harbour View',
        line: 'Answer a few questions',
        needsYou: true,
        over: false,
        view: 'questions',
      },
      {
        address: '12 Ranelagh Road',
        line: 'Application in. Halcyon Lettings is choosing',
        needsYou: false,
        over: false,
        view: 'applied',
      },
    ]);
    expect(await enquiriesNeedingThem(renter.id)).toBe(1);
  });

  it('UX-RH-4: an enquiry is one person’s: adding it again, or to someone else, changes nothing', async () => {
    const { member, lettingId, applicationId, renter } = await aRenterWhoKept();
    expect(await attachEnquiry(renter.id, pointer(member, lettingId, applicationId))).toBe(true);
    const someoneElse = await createTestPerson();
    expect(await attachEnquiry(someoneElse.id, pointer(member, lettingId, applicationId))).toBe(
      false,
    );
    expect(await ownEnquiries(someoneElse.id)).toEqual([]);
    expect((await ownEnquiries(renter.id)).map((row) => row.applicationId)).toEqual([
      applicationId,
    ]);
  });

  it('UX-RH-3: a row opens that home’s own page, by a fresh private link, for its renter only', async () => {
    const { member, applicationId, renter } = await aRenterWhoKept();
    const token = await openEnquiry(renter.id, applicationId);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await resolveAccessLink(token!, 'renter')).toEqual({
      organisationId: member.organisationId,
      subjectId: applicationId,
    });
    // Only a hash of it is kept (ADR-0013).
    const links = await withOrg(member.organisationId, (tx) =>
      tx.select().from(accessLinks).where(eq(accessLinks.subjectId, applicationId)),
    );
    expect(links.some((link) => link.tokenHash.includes(token!))).toBe(false);
    const someoneElse = await createTestPerson();
    expect(await openEnquiry(someoneElse.id, applicationId)).toBeNull();
  });

  it('UX-RH-5: a let home stays, marked, until its details are deleted; then it leaves the list', async () => {
    const { member, lettingId, applicationId, renter } = await aRenterWhoKept();
    const { closeLetting } = await import('@/server/lettings/close');
    await closeLetting(member, lettingId, 'withdrawn');
    const [row] = await enquiryRowsFor(renter.id);
    expect(row).toMatchObject({ over: true, needsYou: false, view: 'home_closed' });
    expect(row!.line).toMatch(/^No longer available\. Your details are deleted by /);
    // The retention job clears the lister's copy on its date. The renter's profile is theirs,
    // and stays (Q25); the row has nothing left to open.
    await sweepPersonalData(new Date(Date.now() + 40 * DAY), member.organisationId);
    expect(await ownEnquiries(renter.id)).toEqual([]);
    expect(await openEnquiry(renter.id, applicationId)).toBeNull();
    expect((await readRenterProfile(renter.id)).monthlyIncomeCents).toBe(520_000);
  });
});

describe('UX-AC-14: the conflict rule is matched by the person', () => {
  it('UX-AC-14: a member whose own Enquiries hold the home can’t open its letting, whatever the address', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    // They enquired from another address, and showed the enquiry is theirs.
    const applicationId = await aRenterEnquires(member, 1);
    expect(await stoppedByConflict(member, lettingId)).toBe(false);
    await attachEnquiry(member.userId, pointer(member, lettingId, applicationId));
    expect(await holdsEnquiryFor(member.userId, lettingId)).toBe(true);
    expect(await stoppedByConflict(member, lettingId)).toBe(true);
    const noted = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ data: events.data, actor: events.actorId })
        .from(events)
        .where(and(eq(events.lettingId, lettingId), eq(events.type, 'letting.conflict_noted'))),
    );
    expect(noted).toEqual([{ data: { stopped: 'page' }, actor: member.userId }]);
  });

  it('UX-AC-14: a colleague, and another of their lettings, are not caught', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    const applicationId = await aRenterEnquires(member, 1);
    const other = await aLiveLetting(member, {
      addressLine1: '4 Harbour View',
      daftUrl: 'https://www.daft.ie/for-rent/house-4-harbour-view/777777',
    });
    const renter = await createTestPerson();
    await attachEnquiry(renter.id, pointer(member, lettingId, applicationId));
    expect(await stoppedByConflict(member, lettingId)).toBe(false);
    expect(await stoppedByConflict(member, other.lettingId)).toBe(false);
  });
});

describe('UX-PF-6: "Delete my profile" deletes it at once', () => {
  it('UX-PF-6: it asks them to confirm it’s them first', async () => {
    const { renter } = await aRenterWhoKept();
    await expect(deleteProfile(renter, null)).rejects.toThrow(ConfirmationNeeded);
    expect((await readRenterProfile(renter.id)).exists).toBe(true);
  });

  it('UX-PF-6: every row goes in one step, the sign-in included, and the lister’s copy stays', async () => {
    const { member, renter, applicationId } = await aRenterWhoKept();
    await changeKeptPart(renter.id, 'mobile', { mobile: '087 123 4567' });
    const before = await rowsOf(renter.id);
    expect(before.renterProfiles).toHaveLength(1);
    expect(before.renterEnquiries).toHaveLength(1);
    expect(before.profileEvents.length).toBeGreaterThan(1);

    expect(await deleteProfile(renter, await confirmedFor(renter))).toEqual({ account: true });

    const after = await rowsOf(renter.id);
    expect(after.renterProfiles).toEqual([]);
    expect(after.renterEnquiries).toEqual([]);
    expect(after.profiles).toEqual([]);
    expect(after.users).toEqual([]);
    // One line stays in the record, with IDs and codes only: that a profile was deleted.
    expect(after.profileEvents.map(({ type, data }) => ({ type, data }))).toEqual([
      { type: 'profile.deleted', data: { by: 'person', account: true } },
    ]);
    // Nothing was queued: it is gone now, not later.
    expect(
      (await queuedJobs('send_account_email')).filter((job) => job.userId === renter.id),
    ).toEqual([]);
    // Rule 9: the application is the lister's copy, and follows the letting's own retention.
    const [application] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(applications).where(eq(applications.id, applicationId)),
    );
    expect(application).toMatchObject({
      monthlyIncomeCents: 520_000,
      personalDataDeletedAt: null,
    });
  });

  it('UX-PF-6: someone who also lets homes keeps their sign-in, and stops being a renter', async () => {
    const lister = await createTestMember();
    const { lettingId, ids } = await peopleWhoApplied(lister, [4300]);
    const admin = await createTestMember({ name: 'Ann Power' });
    const ann = { id: admin.userId, name: admin.name, email: admin.email, emailVerified: true };
    await attachEnquiry(ann.id, pointer(lister, lettingId, ids[0]!));
    await keepEntered(ann.id, await entered(lister, ids[0]!), {
      from: 'tick',
      applicationId: ids[0]!,
    });
    expect((await holdingsOf(ann.id)).contexts).toHaveLength(2);

    expect(await deleteProfile(ann, await confirmedFor(ann))).toEqual({ account: false });

    const after = await rowsOf(ann.id);
    expect(after.renterProfiles).toEqual([]);
    expect(after.renterEnquiries).toEqual([]);
    expect(after.users).toHaveLength(1);
    expect(after.profiles[0]).toMatchObject({ rentingSince: null });
    expect((await holdingsOf(ann.id)).contexts.map((context) => context.side)).toEqual(['letting']);
  });
});

describe('UX-PF-7: a profile unused for two years is deleted, with an email 30 days before', () => {
  /** Puts a profile's last use in the past, as time passing would. */
  async function lastUsed(userId: string, at: Date) {
    await withSystem((tx) =>
      tx.update(renterProfiles).set({ lastUsedAt: at }).where(eq(renterProfiles.userId, userId)),
    );
  }
  const noticesFor = async (userId: string) =>
    (await queuedJobs('send_account_email')).filter((job) => job.userId === userId);

  it('UX-PF-7: 30 days before, the job emails them the date; at two years it deletes the profile', async () => {
    const { renter, member, applicationId } = await aRenterWhoKept();
    const used = new Date('2026-11-17T10:00:00Z');
    await lastUsed(renter.id, used);

    // A year on: nothing.
    await sweepProfiles(new Date('2027-11-17T03:00:00Z'));
    expect(await noticesFor(renter.id)).toEqual([]);

    // 30 days before two years: the notice, once.
    await sweepProfiles(new Date('2028-10-18T03:00:00Z'));
    await sweepProfiles(new Date('2028-10-19T03:00:00Z'));
    expect(await noticesFor(renter.id)).toEqual([
      { kind: 'profile_unused', userId: renter.id, deleteOn: '2028-11-17' },
    ]);
    expect((await readRenterProfile(renter.id)).exists).toBe(true);

    // The day before: still there. On the day: gone, sign-in and all.
    await sweepProfiles(new Date('2028-11-16T03:00:00Z'));
    expect((await rowsOf(renter.id)).users).toHaveLength(1);
    await sweepProfiles(new Date('2028-11-17T03:00:00Z'));
    const after = await rowsOf(renter.id);
    expect(after.renterProfiles).toEqual([]);
    expect(after.renterEnquiries).toEqual([]);
    expect(after.users).toEqual([]);
    expect(after.profileEvents.map(({ type, data }) => ({ type, data }))).toEqual([
      { type: 'profile.deleted', data: { by: 'retention', account: true } },
    ]);
    // The lister's copy of the application is not the job's to touch here.
    const [application] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(applications).where(eq(applications.id, applicationId)),
    );
    expect(application!.personalDataDeletedAt).toBeNull();
  });

  it('UX-PF-7: using the profile after the notice keeps it', async () => {
    const { renter } = await aRenterWhoKept();
    await lastUsed(renter.id, new Date('2026-11-17T10:00:00Z'));
    await sweepProfiles(new Date('2028-10-18T03:00:00Z'));
    expect((await readRenterProfile(renter.id)).deletionNoticeSentAt).toBeInstanceOf(Date);
    await noteProfileUse(renter.id, new Date('2028-10-25T09:00:00Z'));
    expect(await readRenterProfile(renter.id)).toMatchObject({
      deletionNoticeSentAt: null,
      lastUsedAt: new Date('2028-10-25T09:00:00Z'),
    });
    await sweepProfiles(new Date('2028-11-17T03:00:00Z'));
    expect((await readRenterProfile(renter.id)).exists).toBe(true);
  });

  it('UX-PF-7: the email names the date, and isn’t sent to someone who has used it since', async () => {
    const { renter } = await aRenterWhoKept();
    await lastUsed(renter.id, new Date('2026-11-17T10:00:00Z'));
    await sweepProfiles(new Date('2028-10-18T03:00:00Z'));
    const [job] = await noticesFor(renter.id);
    const sentTo = async () =>
      (
        await db().execute<{ subject: string; text: string }>(
          sql`select subject, text from dev_outbox where to_address = ${renter.email}`,
        )
      ).rows;
    await sendAccountEmail(job, 'first');
    const [email] = await sentTo();
    expect(email!.subject).toBe('Your Gaff profile will be deleted on Friday 17 November 2028');
    expect(email!.text).toContain('To keep it, sign in before then.');
    // Used since: a second notice in the queue says nothing.
    await noteProfileUse(renter.id, new Date('2028-10-25T09:00:00Z'));
    await sendAccountEmail(job, 'second');
    expect(await sentTo()).toHaveLength(1);
  });
});

describe('rule 8: the record of a profile holds IDs, codes, yes/no values and dates only', () => {
  it('rule 8: nothing a renter typed or kept is in any event', async () => {
    const { renter, applicationId } = await aRenterWhoKept();
    await changeKeptPart(renter.id, 'mobile', { mobile: '087 123 4567' });
    await changeKeptPart(renter.id, 'income', { earning: 'other', monthlyIncome: '3,333' });
    await changeKeptPart(renter.id, 'answers', { occupants: '4', moveInDate: '2030-01-01' });
    await removeKeptPart(renter.id, 'mobile');
    await setKeeping(renter.id, false);
    await profileForDownload(renter);
    const record = await withPerson(renter.id, (tx) =>
      tx.select({ type: profileEvents.type, data: profileEvents.data }).from(profileEvents),
    );
    expect(record.map((event) => event.type)).toEqual([
      'profile.enquiry_added',
      'profile.details_kept',
      'profile.details_changed',
      'profile.details_changed',
      'profile.details_changed',
      'profile.details_removed',
      'profile.keeping_set',
      'profile.downloaded',
    ]);
    const allowed = /^([0-9a-f-]{36}|[a-z_]+|\d{4}-\d{2}-\d{2})$/;
    for (const event of record) {
      expect(Object.keys(profileEventCatalogue)).toContain(event.type);
      for (const value of Object.values(event.data)) {
        if (typeof value === 'boolean') continue;
        expect(String(value), event.type).toMatch(allowed);
      }
    }
    const everything = JSON.stringify(record);
    for (const personal of [
      renter.name,
      'Aoife',
      renter.email,
      '087',
      '3333',
      '333300',
      '520000',
      '2030-01-01',
    ]) {
      expect(everything).not.toContain(personal);
    }
    expect(everything).toContain(applicationId);
  });
});

describe('"Download my details"', () => {
  it('holds what Gaff keeps on their profile, and nobody else’s', async () => {
    const { renter, applicationId } = await aRenterWhoKept();
    await aRenterWhoKept();
    const download = await profileForDownload(renter);
    expect(download).toMatchObject({
      name: 'Aoife Byrne',
      email: renter.email,
      kept: { earning: 'employed', monthlyIncomeCents: 520_000, answers: { occupants: 1 } },
      signIn: { providers: [], passkeys: 0 },
    });
    expect(download.rentingSince).toBeInstanceOf(Date);
    expect(download.enquiries.map((enquiry) => enquiry.applicationId)).toEqual([applicationId]);
  });
});
