import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { registerSource } from '@/adapters/register';
import { db, withOrg, withPerson } from '@/db/client';
import {
  lettings,
  memberships,
  organisations,
  psraRegister,
  users,
  viewingSessions,
} from '@/db/schema';
import { newLettingSchema } from '@/domain/lettings/new-letting';
import { viewingSessionSchema, type ViewingSession } from '@/domain/viewings/viewing-session';
import { env } from '@/lib/env';
import { irishToday } from '@/lib/format';
import { claimAgency, findRegisterEntryByLicence } from '@/server/accounts/agencies';
import { ensureOwnHomes, type SignedInPerson } from '@/server/accounts/contexts';
import { confirmAgency } from '@/server/accounts/staff';
import { findMember, type Member } from '@/server/auth/member';
import type { Staff } from '@/server/auth/staff';
import { keepIdentityIn, keptIdentityIn } from '@/server/identity/kept';
import { createLetting } from '@/server/lettings/create-letting';
import { startTakingEnquiries } from '@/server/lettings/go-live';
import { setHomePoint } from '@/server/lettings/location';
import { addPhoto } from '@/server/lettings/photos';
import { lettingDetailIn } from '@/server/lettings/queries';
import { recordRentCheck } from '@/server/lettings/rent-check';
import { setLettingDetails } from '@/server/lettings/set-criteria';
import { addViewingSession } from '@/server/lettings/viewing-sessions';
import { refreshRegister } from '@/server/register/refresh';
import { seedListers, type SeedHome, type SeedLister } from './seed-homes';
import { seedPhoto } from './seed-photos';

/**
 * BA-4: the test copy's made-up agencies, private landlord and homes, so it is useful the moment
 * it opens: homes to search, find on the map and ask to view, and lettings to run. Everything is
 * made through the product's own use cases, so every row and event is what the product itself
 * would write: the agencies are found on the (made-up) sample register and claimed by their
 * first admin, then confirmed; the private landlord confirms it's them; each home is added, given
 * its letting details, photos (through the photo pipeline), pin, rent check and viewing times,
 * and put live by its lister's decision.
 *
 * Safe to run on every deploy. It adds what is missing and changes nothing a tester made: a
 * seeded home that's there is only finished if an earlier run stopped part way, a photo or pin a
 * tester added stays, a closed letting stays closed, and the only thing each run adds to a live
 * home is viewing times, so there are always some ahead. It never runs in production.
 */

/** Two sessions ahead is enough; with fewer, each run adds the next two. */
const VIEWING_SESSIONS_AHEAD = 2;

/**
 * Who confirms the made-up agencies: Gaff's team, as the seed stands in for it on the test copy.
 * A made-up address, never on STAFF_EMAILS, so this person can't open Gaff's own pages.
 */
const SEED_TEAM = { name: 'Gaff test team', email: 'seed@team.gaff.test' };

export interface SeedReport {
  listers: { created: number; existing: number; skipped: number };
  homes: { added: number; existing: number; finished: number; closed: number; notLive: number };
  photosAdded: number;
  pinsPlaced: number;
  viewingTimesAdded: number;
  registerLoaded: boolean;
}

/** Whether this build should seed: the test copy's production deployment only (not previews). */
export function shouldSeed(source: Record<string, string | undefined>): boolean {
  if (source.GAFF_ENV !== 'staging') return false;
  return source.VERCEL !== '1' || source.VERCEL_ENV === 'production';
}

function daysFrom(now: Date, days: number): string {
  return irishToday(new Date(now.getTime() + days * 86_400_000));
}

/** A person as Gaff's sign-in makes them: signed in once, with their email confirmed. */
async function personFor(person: { name: string; email: string }): Promise<SignedInPerson> {
  const [existing] = await db().select().from(users).where(eq(users.email, person.email));
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      email: existing.email,
      emailVerified: existing.emailVerified,
    };
  }
  const made = { id: crypto.randomUUID(), ...person, emailVerified: true };
  await db().insert(users).values(made);
  return made;
}

/**
 * The seed acting as Gaff's team, to confirm its own made-up agencies (UX-AG-4). This is the
 * one place a Staff is made other than `staffFrom()`, and it never runs in production.
 */
async function seedTeam(): Promise<Staff> {
  const person = await personFor(SEED_TEAM);
  return { userId: person.id } as Staff;
}

async function registerHas(licenceNumbers: string[]): Promise<boolean> {
  const rows = await db()
    .select({ licenceNumber: psraRegister.licenceNumber })
    .from(psraRegister)
    .where(
      and(inArray(psraRegister.licenceNumber, licenceNumbers), isNull(psraRegister.removedAt)),
    );
  return rows.length === new Set(licenceNumbers).size;
}

/**
 * The made-up agencies are on the made-up sample register. A new database has no copy of it
 * until the daily job's first refresh, so the seed runs that refresh itself, as the job would.
 * A register from the PSRA's own download never holds them, and is never refreshed here.
 */
async function ensureRegister(): Promise<boolean> {
  const licences = seedListers.flatMap((lister) => lister.licenceNumber ?? []);
  if (await registerHas(licences)) return false;
  const source = registerSource();
  if (source.name !== 'sample') return false;
  await refreshRegister(source);
  return true;
}

type Seeded = { member: Member; created: boolean } | null;

/**
 * UX-AG-1 to UX-AG-4: the agency's first admin finds it on the register, says "Yes, that's us",
 * and Gaff's team confirms it. An agency someone else already holds on Gaff is left alone.
 */
async function seedAgency(lister: SeedLister, team: Staff): Promise<Seeded> {
  const found = await findRegisterEntryByLicence(lister.licenceNumber!);
  if (!found.ok) return null;
  const person = await personFor(lister.person);
  const [own] = await db()
    .select({ id: organisations.id, confirmedAt: organisations.confirmedAt })
    .from(memberships)
    .innerJoin(organisations, eq(organisations.id, memberships.organisationId))
    .where(
      and(eq(memberships.userId, person.id), eq(organisations.psraRegisterEntryId, found.entry.id)),
    );
  let organisationId = own?.id ?? null;
  const created = !organisationId;
  if (!organisationId) {
    const claimed = await claimAgency(person, found.entry.id);
    if (claimed.result !== 'created') return null;
    organisationId = claimed.organisationId;
  }
  if (!own?.confirmedAt) {
    try {
      await confirmAgency(team, organisationId);
    } catch {
      // Another agency on Gaff holds the licence now: this one stays as a tester left it.
      return null;
    }
  }
  const member = await findMember(person.id, organisationId);
  return member ? { member, created } : null;
}

/**
 * UX-AC-7, UX-TS-2 (Q47): a private landlord's own homes, and their identity, confirmed once as
 * a passed check leaves it: the name and the date on their own profile, the date on their homes.
 */
async function seedPrivateLandlord(lister: SeedLister, now: Date): Promise<Seeded> {
  const person = await personFor(lister.person);
  const { organisationId, created } = await ensureOwnHomes(person);
  await withPerson(person.id, async (tx) => {
    if (await keptIdentityIn(tx, person.id)) return;
    await keepIdentityIn(tx, person.id, { verifiedName: person.name, verifiedAt: now }, 'go_live');
  });
  const member = await findMember(person.id, organisationId);
  return member ? { member, created } : null;
}

/** Two viewing times in the next week: an evening of slots, and a late-morning group viewing. */
function viewingTimes(now: Date): ViewingSession[] {
  const schema = viewingSessionSchema(now);
  return [
    schema.parse({
      date: daysFrom(now, 3),
      start: '18:00',
      end: '19:00',
      kind: 'slots',
      slotMinutes: '15',
    }),
    schema.parse({
      date: daysFrom(now, 6),
      start: '11:00',
      end: '12:00',
      kind: 'group',
      capacity: '8',
    }),
  ];
}

/** Keeps viewing times ahead: with fewer than two sessions to come, the next two are added. */
async function topUpViewings(member: Member, lettingId: string, now: Date): Promise<number> {
  const ahead = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ id: viewingSessions.id })
      .from(viewingSessions)
      .where(and(eq(viewingSessions.lettingId, lettingId), gt(viewingSessions.startsAt, now))),
  );
  if (ahead.length >= VIEWING_SESSIONS_AHEAD) return 0;
  let added = 0;
  for (const session of viewingTimes(now)) {
    try {
      await addViewingSession(member, lettingId, session);
      added += 1;
    } catch {
      // A time a tester added overlaps it; theirs stays.
    }
  }
  return added;
}

async function addPhotos(member: Member, lettingId: string, lister: SeedLister, home: SeedHome) {
  let added = 0;
  for (const photo of home.photos) {
    const result = await addPhoto(member, lettingId, await seedPhoto(photo, lister.framing));
    if (!result.ok) throw new Error(`A seed photo was refused: ${result.problem}`);
    added += 1;
  }
  return added;
}

function lettingFor(home: SeedHome, now: Date) {
  return newLettingSchema(now).parse({
    addressLine2: '',
    availableFrom: daysFrom(now, 21),
    photosUrl: '',
    daftUrl: '',
    myhomeUrl: '',
    landlordName: '',
    landlordEmail: '',
    description: home.description,
    ...home.letting,
  });
}

async function seededLettingOf(member: Member, home: SeedHome): Promise<string | null> {
  const [row] = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ id: lettings.id })
      .from(lettings)
      .where(
        and(
          eq(lettings.organisationId, member.organisationId),
          eq(lettings.addressLine1, home.letting.addressLine1!),
        ),
      )
      .orderBy(desc(lettings.createdAt))
      .limit(1),
  );
  return row?.id ?? null;
}

/**
 * Takes a seeded home as far as live, doing only what isn't done yet: the letting details, the
 * photos, the pin, the rent check, viewing times and the decision to go live. A home that is
 * already live gets only viewing times; a closed one, nothing.
 */
async function seedHome(
  member: Member,
  lister: SeedLister,
  home: SeedHome,
  now: Date,
  report: SeedReport,
): Promise<void> {
  let lettingId = await seededLettingOf(member, home);
  const isNew = !lettingId;
  if (!lettingId) {
    lettingId = (await createLetting(member, lettingFor(home, now))).lettingId;
    report.homes.added += 1;
  } else {
    report.homes.existing += 1;
  }
  const detail = await withOrg(member.organisationId, (tx) => lettingDetailIn(tx, lettingId));
  if (!detail) throw new Error('A seeded letting went missing');
  const { letting } = detail;
  if (letting.status === 'let' || letting.status === 'withdrawn') {
    report.homes.closed += 1;
    return;
  }
  if (letting.stage === 'setup') {
    if (!isNew) report.homes.finished += 1;
    if (!detail.setup.criteriaSet) {
      await setLettingDetails(member, lettingId, {
        criteria: home.criteria,
        noSmokingIndoors: home.noSmokingIndoors,
      });
    }
    if (detail.photos.length === 0) {
      report.photosAdded += await addPhotos(member, lettingId, lister, home);
    }
    if (letting.pointSource === null) {
      const pinned = await setHomePoint(member, lettingId, home.point, now);
      if (!pinned.ok) throw new Error('A seed pin was refused');
      report.pinsPlaced += 1;
    }
    if (!detail.setup.rentCheckDone) {
      await recordRentCheck(member, lettingId, { lastLet: 'never' });
    }
  }
  report.viewingTimesAdded += await topUpViewings(member, lettingId, now);
  if (letting.stage === 'setup' && (await startTakingEnquiries(member, lettingId)) !== 'live') {
    report.homes.notLive += 1;
  }
}

/** Seeds the test copy. Never runs in production. */
export async function seedTestCopy(now: Date = new Date()): Promise<SeedReport> {
  if (env().GAFF_ENV === 'production') throw new Error('The seed never runs in production');
  const report: SeedReport = {
    listers: { created: 0, existing: 0, skipped: 0 },
    homes: { added: 0, existing: 0, finished: 0, closed: 0, notLive: 0 },
    photosAdded: 0,
    pinsPlaced: 0,
    viewingTimesAdded: 0,
    registerLoaded: await ensureRegister(),
  };
  const team = await seedTeam();
  for (const lister of seedListers) {
    const seeded =
      lister.kind === 'agency'
        ? await seedAgency(lister, team)
        : await seedPrivateLandlord(lister, now);
    if (!seeded) {
      report.listers.skipped += 1;
      continue;
    }
    report.listers[seeded.created ? 'created' : 'existing'] += 1;
    for (const home of lister.homes) await seedHome(seeded.member, lister, home, now, report);
  }
  return report;
}
