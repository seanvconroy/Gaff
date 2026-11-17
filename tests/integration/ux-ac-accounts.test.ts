import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg, withPerson, withSystem } from '@/db/client';
import {
  applications,
  events,
  funnelEvents,
  lettings,
  memberships,
  organisations,
  profiles,
} from '@/db/schema';
import { currentContext } from '@/domain/navigation/context';
import { claimAgency, rememberAgencyStep } from '@/server/accounts/agencies';
import { CONFLICT_MESSAGE, stoppedByConflict } from '@/server/accounts/conflict';
import {
  ensureOwnHomes,
  saveName,
  startRenting,
  startRentingIfArriving,
  switchContext,
} from '@/server/accounts/contexts';
import { noteLettingFor, readProfile } from '@/server/accounts/profile';
import { findMember, holdingsOf } from '@/server/auth/member';
import { recordDecision } from '@/server/decisions/record-decision';
import { createLetting } from '@/server/lettings/create-letting';
import { startTakingEnquiries } from '@/server/lettings/go-live';
import { listLettings } from '@/server/lettings/queries';
import { aLetting } from '../fixtures/lettings';
import {
  aLiveLetting,
  aRegisterEntry,
  aRenterEnquires,
  createTestMember,
  createTestPerson,
  databaseError,
  queuedJobs,
  reloaded,
  verifyForTest,
} from './helpers';

const keys = async (userId: string) =>
  (await holdingsOf(userId)).contexts.map((context) => context.key);

async function openContext(userId: string) {
  const { contexts, profile } = await holdingsOf(userId);
  return currentContext(contexts, {
    side: profile.lastSide,
    organisationId: profile.lastOrganisationId,
  });
}

describe('UX-AC-1, UX-AC-2: one person, one profile, several roles', () => {
  it('UX-AC-2: one person works at an agency, lets their own home and rents, on one account', async () => {
    const person = await createTestPerson();
    expect(await keys(person.id)).toEqual([]);

    const claimed = await claimAgency(person, (await aRegisterEntry()).id);
    if (claimed.result !== 'created') throw new Error('the agency was not set up');
    const own = await ensureOwnHomes(person);
    await startRenting(person);

    const { contexts, members } = await holdingsOf(person.id);
    expect(contexts.map((context) => [context.key, context.side])).toEqual([
      [claimed.organisationId, 'letting'],
      [own.organisationId, 'letting'],
      ['renting', 'renting'],
    ]);
    // One person in each organisation: the same user, name and email throughout.
    expect(new Set(members.map((member) => member.userId))).toEqual(new Set([person.id]));
    expect(members.map((member) => member.organisationKind)).toEqual([
      'agency',
      'private_landlord',
    ]);
  });

  it('UX-AC-2, UX-AC-8: none of them blocks another, whichever comes first', async () => {
    const renterFirst = await createTestPerson();
    await startRenting(renterFirst);
    await ensureOwnHomes(renterFirst);
    const claimed = await claimAgency(renterFirst, (await aRegisterEntry()).id);
    expect(claimed.result).toBe('created');
    expect(await keys(renterFirst.id)).toHaveLength(3);

    const landlordFirst = await createTestPerson();
    await ensureOwnHomes(landlordFirst);
    await startRenting(landlordFirst);
    expect(await keys(landlordFirst.id)).toHaveLength(2);
  });

  it('UX-AC-1: the name is kept once, on the person, and used in every role', async () => {
    const person = await createTestPerson({ name: '' });
    await saveName(person, '  Ann Power ');
    const named = await reloaded(person);
    expect(named.name).toBe('Ann Power');
    await ensureOwnHomes(named);
    await claimAgency(named, (await aRegisterEntry()).id);
    const { members } = await holdingsOf(person.id);
    expect(members.map((member) => member.name)).toEqual(['Ann Power', 'Ann Power']);
  });

  it('a name that isn’t one is refused, in plain words', async () => {
    const person = await createTestPerson({ name: '' });
    await expect(saveName(person, '')).rejects.toThrow('Enter your name');
    await expect(saveName(person, 'ann@halcyon.test')).rejects.toThrow(/not your email/);
  });
});

describe('UX-AC-4, UX-AC-7: a private landlord’s organisation of one, made silently', () => {
  it('UX-AC-7: it is made from the person alone: no business name, no licence', async () => {
    const person = await createTestPerson({ name: 'Seán Ó Briain' });
    const { organisationId, created } = await ensureOwnHomes(person);
    expect(created).toBe(true);
    const [organisation] = await db()
      .select()
      .from(organisations)
      .where(eq(organisations.id, organisationId));
    expect(organisation).toMatchObject({
      kind: 'private_landlord',
      // UX-AC-9: what renters call them, for now: their first name.
      name: 'Seán',
      psraLicenceNumber: null,
      psraRegisterEntryId: null,
      confirmedAt: null,
      approveBeforeSend: true,
    });
    // Rule 8: their Gaff address, which is in web addresses and reply-tos, holds no name.
    expect(organisation!.inboundSlug).toMatch(/^home-[a-z0-9]{8}$/);
    expect(organisation!.inboundSlug).not.toMatch(/se[aá]n|briain/i);
  });

  it('they are its one member and its admin, and the record says how it began', async () => {
    const person = await createTestPerson();
    const { organisationId } = await ensureOwnHomes(person);
    const members = await db()
      .select({ userId: memberships.userId, role: memberships.role })
      .from(memberships)
      .where(eq(memberships.organisationId, organisationId));
    expect(members).toEqual([{ userId: person.id, role: 'admin' }]);
    const record = await withOrg(organisationId, (tx) =>
      tx.select({ type: events.type, data: events.data, actor: events.actorType }).from(events),
    );
    expect(record).toEqual([
      { type: 'organisation.created', data: { kind: 'private_landlord' }, actor: 'person' },
      { type: 'member.joined', data: { role: 'admin' }, actor: 'person' },
    ]);
  });

  it('a person has one: asking again gives the same one back', async () => {
    const person = await createTestPerson();
    const first = await ensureOwnHomes(person);
    const [again, alsoAgain] = await Promise.all([ensureOwnHomes(person), ensureOwnHomes(person)]);
    expect(again).toEqual({ organisationId: first.organisationId, created: false });
    expect(alsoAgain.organisationId).toBe(first.organisationId);
    expect((await holdingsOf(person.id)).members).toHaveLength(1);
  });

  it('two people asking at once each get their own', async () => {
    const [a, b] = await Promise.all([
      createTestPerson({ name: 'Ann Power' }),
      createTestPerson({ name: 'Ann Byrne' }),
    ]);
    const [homesA, homesB] = await Promise.all([ensureOwnHomes(a), ensureOwnHomes(b)]);
    expect(homesA.organisationId).not.toBe(homesB.organisationId);
  });

  it('it needs a name, and nothing else', async () => {
    const person = await createTestPerson({ name: '' });
    await expect(ensureOwnHomes(person)).rejects.toThrow('Enter your name');
    await saveName(person, 'Ann Power');
    // The name given a moment ago counts, even before the session has caught up.
    expect((await ensureOwnHomes(person)).created).toBe(true);
  });

  it('ADR-0004: its lettings are its own: tenant isolation holds for it as for an agency', async () => {
    const landlord = await createTestPerson();
    const { organisationId } = await ensureOwnHomes(landlord);
    const member = (await findMember(landlord.id, organisationId))!;
    const { lettingId } = await createLetting(member, aLetting());
    const agency = await createTestMember();

    expect((await listLettings(member)).map((letting) => letting.id)).toEqual([lettingId]);
    expect(await listLettings(agency)).toEqual([]);
    const seenByAgency = await withOrg(agency.organisationId, (tx) =>
      tx.select().from(lettings).where(eq(lettings.id, lettingId)),
    );
    expect(seenByAgency).toEqual([]);
    expect(await db().select().from(lettings).where(eq(lettings.id, lettingId))).toEqual([]);
  });

  it('UX-AC-7: a private landlord’s home goes live with no licence and no confirmation', async () => {
    const landlord = await createTestPerson();
    const { organisationId } = await ensureOwnHomes(landlord);
    const member = (await findMember(landlord.id, organisationId))!;
    // UX-TS-2 (Q47): the one thing asked is that they confirm it's them, once (WP-24's tests).
    await verifyForTest(landlord.id, landlord.name);
    const { lettingId } = await aLiveLetting(member);
    const [letting] = await withOrg(organisationId, (tx) =>
      tx.select().from(lettings).where(eq(lettings.id, lettingId)),
    );
    expect(letting).toMatchObject({ status: 'live', goLiveHeldAt: null });
  });
});

describe('UX-AC-5: nothing crosses between roles', () => {
  it('ADR-0016: the profile table is protected by row-level security, for the person alone', async () => {
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
      where n.nspname = 'public' and c.relname = 'profiles'`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ enabled: true, forced: true, policy: 'person_only' });
    // The policy knows nothing of organisations: no organisation's setting opens it.
    expect(rows[0]!.using).toContain('app.person_id');
    expect(rows[0]!.using).not.toContain('app.org_id');
    const { rows: columns } = await db().execute<{ column: string }>(sql`
      select column_name as column from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles'`);
    expect(columns.map((row) => row.column)).not.toContain('organisation_id');
  });

  it('UX-AC-5: an operator’s access path cannot read a member’s own profile', async () => {
    // Ann works at an agency, and is also looking for a home: that is on her own profile.
    const admin = await createTestMember({ name: 'Ann Power' });
    const ann = { id: admin.userId, name: admin.name, email: admin.email, emailVerified: true };
    await startRenting(ann);
    expect((await readProfile(ann.id)).rentingSince).toBeInstanceOf(Date);

    // Her own agency, through the only path an operator's query has: nothing.
    const asHerAgency = await withOrg(admin.organisationId, (tx) => tx.select().from(profiles));
    expect(asHerAgency).toEqual([]);
    const asked = await withOrg(admin.organisationId, (tx) =>
      tx.select().from(profiles).where(eq(profiles.userId, ann.id)),
    );
    expect(asked).toEqual([]);
    // Nor by joining from the membership the agency does hold.
    const joined = await withOrg(admin.organisationId, (tx) =>
      tx
        .select({ renting: profiles.rentingSince })
        .from(memberships)
        .innerJoin(profiles, eq(profiles.userId, memberships.userId))
        .where(eq(memberships.organisationId, admin.organisationId)),
    );
    expect(joined).toEqual([]);
    // Another organisation, and a query with no scope at all: nothing.
    const other = await createTestMember();
    expect(await withOrg(other.organisationId, (tx) => tx.select().from(profiles))).toEqual([]);
    expect(await db().select().from(profiles)).toEqual([]);
  });

  it('UX-AC-5: one person’s path reads their own profile and nobody else’s', async () => {
    const ann = await createTestPerson();
    const aoife = await createTestPerson({ name: 'Aoife Byrne' });
    await startRenting(ann);
    await startRenting(aoife);
    const seen = await withPerson(ann.id, (tx) => tx.select().from(profiles));
    expect(seen.map((row) => row.userId)).toEqual([ann.id]);
    const asked = await withPerson(ann.id, (tx) =>
      tx.select().from(profiles).where(eq(profiles.userId, aoife.id)),
    );
    expect(asked).toEqual([]);
  });

  it('UX-AC-5: an operator’s path cannot write a profile, or change one', async () => {
    const admin = await createTestMember();
    const person = await createTestPerson();
    expect(
      await databaseError(
        withOrg(admin.organisationId, (tx) =>
          tx.insert(profiles).values({ userId: person.id, rentingSince: new Date() }),
        ),
      ),
    ).toMatch(/row-level security/);
    await startRenting(person);
    const changed = await withOrg(admin.organisationId, (tx) =>
      tx
        .update(profiles)
        .set({ rentingSince: null })
        .where(eq(profiles.userId, person.id))
        .returning({ userId: profiles.userId }),
    );
    expect(changed).toEqual([]);
    expect((await readProfile(person.id)).rentingSince).toBeInstanceOf(Date);
  });

  it('UX-AC-5: an agency sees nothing of a member’s own lettings', async () => {
    const admin = await createTestMember();
    const ann = { id: admin.userId, name: admin.name, email: admin.email, emailVerified: true };
    const own = await ensureOwnHomes(ann);
    const asLandlord = (await findMember(ann.id, own.organisationId))!;
    const { lettingId } = await createLetting(asLandlord, aLetting());
    // The same person, as the agency's member, on the agency's path.
    const asAgent = (await findMember(ann.id, admin.organisationId))!;
    expect(await listLettings(asAgent)).toEqual([]);
    expect(
      await withOrg(admin.organisationId, (tx) =>
        tx.select().from(lettings).where(eq(lettings.id, lettingId)),
      ),
    ).toEqual([]);
  });

  it('rule 9: the system’s path can reach profiles, so retention can delete them', async () => {
    const person = await createTestPerson();
    await startRenting(person);
    const rows = await withSystem((tx) =>
      tx.select().from(profiles).where(eq(profiles.userId, person.id)),
    );
    expect(rows).toHaveLength(1);
  });
});

describe('UX-AC-6, UX-AC-10: first run', () => {
  it('UX-AC-6: a renter finishes first run with no organisation, and it is counted once', async () => {
    const person = await createTestPerson();
    await startRenting(person);
    await startRenting(person);
    expect(await keys(person.id)).toEqual(['renting']);
    expect((await holdingsOf(person.id)).members).toEqual([]);
    const steps = await withSystem((tx) =>
      tx
        .select({ step: funnelEvents.step, variant: funnelEvents.variant })
        .from(funnelEvents)
        .where(eq(funnelEvents.subjectId, person.id)),
    );
    expect(steps).toEqual([{ step: 'first_run.set_up_finished', variant: 'renter' }]);
  });

  it('UX-AC-6: someone on their way to Saved is renting, and isn’t asked', async () => {
    const person = await createTestPerson({ name: '' });
    await startRentingIfArriving(person.id, '/today');
    expect(await keys(person.id)).toEqual([]);
    await startRentingIfArriving(person.id, '/saved');
    expect(await keys(person.id)).toEqual(['renting']);
    // Someone who already has a context has it left alone.
    const landlord = await createTestPerson();
    await ensureOwnHomes(landlord);
    await startRentingIfArriving(landlord.id, '/enquiries');
    expect(await keys(landlord.id)).toHaveLength(1);
  });

  it('UX-AC-10: where they got to is kept on their profile, and cleared when they finish', async () => {
    const person = await createTestPerson();
    const entry = await aRegisterEntry();
    await rememberAgencyStep(person, null);
    expect(await readProfile(person.id)).toMatchObject({
      firstRunPurpose: 'agency',
      firstRunRegisterEntryId: null,
    });
    await rememberAgencyStep(person, entry.id);
    expect((await readProfile(person.id)).firstRunRegisterEntryId).toBe(entry.id);
    // UX-AC-8: they change their mind. Nothing was fixed by the first answer.
    await startRenting(person);
    expect(await readProfile(person.id)).toMatchObject({
      firstRunPurpose: null,
      firstRunRegisterEntryId: null,
    });
  });
});

describe('UX-AC-11 to UX-AC-13: switching between contexts', () => {
  it('UX-AC-13: a new context opens as it is added', async () => {
    const person = await createTestPerson();
    await startRenting(person);
    expect((await openContext(person.id))?.key).toBe('renting');
    const own = await ensureOwnHomes(person);
    expect((await openContext(person.id))?.key).toBe(own.organisationId);
  });

  it('UX-AC-11: one tap switches, and Gaff reopens the context used last', async () => {
    const person = await createTestPerson();
    const own = await ensureOwnHomes(person);
    const claimed = await claimAgency(person, (await aRegisterEntry()).id);
    if (claimed.result !== 'created') throw new Error('the agency was not set up');
    await startRenting(person);

    expect(await switchContext(person, own.organisationId)).toBe('/today');
    expect((await openContext(person.id))?.label).toBe('My own homes');
    expect((await findMember(person.id))?.organisationId).toBe(own.organisationId);

    expect(await switchContext(person, 'renting')).toBe('/');
    expect((await openContext(person.id))?.key).toBe('renting');
    // The workspace still knows which organisation they let for last.
    expect((await findMember(person.id))?.organisationId).toBe(own.organisationId);

    expect(await switchContext(person, claimed.organisationId)).toBe('/today');
    expect((await findMember(person.id))?.organisationId).toBe(claimed.organisationId);
  });

  it('UX-AC-11: nobody switches to a context that isn’t theirs', async () => {
    const person = await createTestPerson();
    await startRenting(person);
    const stranger = await createTestMember();
    await expect(switchContext(person, stranger.organisationId)).rejects.toThrow(/couldn’t find/);
    expect((await openContext(person.id))?.key).toBe('renting');
    expect(await findMember(person.id)).toBeNull();
    expect(await findMember(person.id, stranger.organisationId)).toBeNull();
  });

  it('UX-AC-11: using the workspace is using that context', async () => {
    const person = await createTestPerson();
    const own = await ensureOwnHomes(person);
    await startRenting(person);
    await noteLettingFor(person.id, own.organisationId);
    expect((await openContext(person.id))?.key).toBe(own.organisationId);
  });
});

describe('UX-AC-14: a member can’t work on a letting they applied for as a renter', () => {
  /** A live letting that the member's own verified address has enquired about. */
  async function aLettingTheMemberAppliedFor() {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    const applicationId = await aRenterEnquires(member, 1);
    await withOrg(member.organisationId, (tx) =>
      tx
        .update(applications)
        .set({ email: member.email, emailNormalised: member.email.toLowerCase() })
        .where(eq(applications.id, applicationId)),
    );
    return { member, lettingId };
  }

  it('they are stopped from opening it, it goes in the record once, and an admin is told', async () => {
    const { member, lettingId } = await aLettingTheMemberAppliedFor();
    expect(await stoppedByConflict(member, lettingId)).toBe(true);
    expect(await stoppedByConflict(member, lettingId)).toBe(true);
    const noted = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ data: events.data, actor: events.actorId })
        .from(events)
        .where(and(eq(events.lettingId, lettingId), eq(events.type, 'letting.conflict_noted'))),
    );
    expect(noted).toEqual([{ data: { stopped: 'page' }, actor: member.userId }]);
    const emails = (await queuedJobs('send_account_email')).filter(
      (job) => job.lettingId === lettingId,
    );
    expect(emails).toEqual([
      {
        kind: 'member_conflict',
        organisationId: member.organisationId,
        lettingId,
        memberUserId: member.userId,
      },
    ]);
  });

  it('rule 1: they can’t decide anything on it', async () => {
    const { member, lettingId } = await aLettingTheMemberAppliedFor();
    await expect(
      withOrg(member.organisationId, (tx) =>
        recordDecision(tx, { member, kind: 'close_letting', lettingId, basis: {} }),
      ),
    ).rejects.toThrow(CONFLICT_MESSAGE);
  });

  it('a member who didn’t enquire opens it and decides as ever', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    await aRenterEnquires(member, 1);
    expect(await stoppedByConflict(member, lettingId)).toBe(false);
    const decision = await withOrg(member.organisationId, (tx) =>
      recordDecision(tx, { member, kind: 'close_letting', lettingId, basis: {} }),
    );
    expect(decision.lettingId).toBe(lettingId);
  });

  it('a colleague on the same team isn’t stopped: it is only the person who applied', async () => {
    const { member, lettingId } = await aLettingTheMemberAppliedFor();
    const colleague = await createTestPerson({ name: 'Brian Daly' });
    await db()
      .insert(memberships)
      .values({ organisationId: member.organisationId, userId: colleague.id, role: 'negotiator' });
    const asColleague = (await findMember(colleague.id, member.organisationId))!;
    expect(await stoppedByConflict(asColleague, lettingId)).toBe(false);
    // And the home they did go live with is untouched by any of this.
    expect(await startTakingEnquiries(asColleague, lettingId)).toBe('live');
  });
});
