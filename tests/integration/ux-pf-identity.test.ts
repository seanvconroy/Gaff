import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg, withPerson, withSystem } from '@/db/client';
import {
  applications,
  checks,
  events,
  identityChecks,
  lettings,
  organisations,
  profileEvents,
  verifiedIdentities,
} from '@/db/schema';
import { identityStep, keptIdentityColumns } from '@/domain/identity/identity';
import { goLiveGate } from '@/domain/organisations/go-live-gate';
import { openJson } from '@/lib/crypto';
import { ensureOwnHomes } from '@/server/accounts/contexts';
import { deleteProfile, profileForDownload } from '@/server/accounts/delete-profile';
import { applicantsFor, chooseApplicants } from '@/server/applications/choose';
import { findConfirmation, grantConfirmation } from '@/server/auth/confirm';
import { checkResultsFor, recordProviderResult, startProviderCheck } from '@/server/checks/checks';
import { keptIdentityOf } from '@/server/identity/kept';
import { personCheckOf, startPersonCheck } from '@/server/identity/person-checks';
import {
  keepPassedIdentity,
  keepQuestionFor,
  passedIdentityFor,
  reuseKeptIdentity,
} from '@/server/identity/renter';
import { goLiveStepFor, startTakingEnquiries } from '@/server/lettings/go-live';
import { overviewFactsFor, peopleFor } from '@/server/lettings/page';
import { getLetting } from '@/server/lettings/queries';
import { recordRentCheck } from '@/server/lettings/rent-check';
import { publicHomes } from '@/server/homes/public-homes';
import { addPhoto } from '@/server/lettings/photos';
import { aPng } from '../fixtures/photos';
import {
  aLiveLetting,
  createTestMember,
  createTestPerson,
  type Member,
  peopleWhoApplied,
  tokenInMessage,
  verifyForTest,
} from './helpers';

/** The stand-in's check ID, from where the provider was told to send the person. */
const checkIdIn = (started: { redirectUrl: string } | { problem: string }) =>
  /\/dev\/checks\/([0-9a-f-]{36})/.exec('redirectUrl' in started ? started.redirectUrl : '')![1]!;

/** An agency's letting with three applicants; the first two chosen, with their checks link. */
async function chosen(member?: Member) {
  const agency = member ?? (await createTestMember());
  const { lettingId, ids } = await peopleWhoApplied(agency, [5200, 4800, 6000]);
  await chooseApplicants(agency, lettingId, { preferredId: ids[0]!, backupId: ids[1]! });
  const token = await tokenInMessage(agency, ids[0]!, 'checks_invitation');
  return { member: agency, lettingId, ids, token };
}

/** The renter passes this home's ID check with the provider. */
async function passIdCheck(token: string, verifiedName: string, now = new Date()) {
  const started = await startProviderCheck(token, 'identity');
  await recordProviderResult(
    checkIdIn(started),
    { kind: 'identity', result: { verified: true, verifiedName } },
    now,
  );
}

const identityCheckOf = async (member: Member, applicationId: string) => {
  const [row] = await withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(checks)
      .where(and(eq(checks.applicationId, applicationId), eq(checks.kind, 'identity'))),
  );
  return row!;
};

/** Everything an operator's own paths show of a letting, as one string. */
async function whatTheOperatorSees(member: Member, lettingId: string): Promise<string> {
  const detail = await getLetting(member, lettingId);
  const people = await peopleFor(member, lettingId);
  const applicants = await applicantsFor(member, lettingId);
  const overview = detail ? await overviewFactsFor(member, detail) : null;
  return JSON.stringify({ people, applicants, overview });
}

async function confirmedFor(userId: string) {
  const grant = await grantConfirmation(userId, 'delete_profile', 'email_code');
  return (await findConfirmation(userId, 'delete_profile', grant))!;
}

describe('UX-PF-10: a kept identity is three things, and nothing else is stored', () => {
  it('UX-PF-10: the table holds whose it is, the name and the date, and no other column', async () => {
    const { rows } = await db().execute<{ column: string }>(sql`
      select column_name as column from information_schema.columns
      where table_schema = 'public' and table_name = 'verified_identities'
      order by ordinal_position`);
    expect(rows.map((row) => row.column)).toEqual([...keptIdentityColumns]);
    // A person's own check while it runs holds codes and dates, never a result or a document.
    const { rows: running } = await db().execute<{ column: string }>(sql`
      select column_name as column from information_schema.columns
      where table_schema = 'public' and table_name = 'identity_checks'`);
    expect(running.map((row) => row.column).sort()).toEqual(
      [
        'id',
        'user_id',
        'purpose',
        'status',
        'reason',
        'provider',
        'provider_ref',
        'started_at',
      ].sort(),
    );
  });

  it('UX-PF-10: after a check passes and is kept, no row or event holds more than the result, the name and the date', async () => {
    const { member, ids, token } = await chosen();
    const renter = await createTestPerson({ name: 'Renter 1' });
    await passIdCheck(token, 'Renter 1');
    expect(await keepPassedIdentity(token, renter.id)).toBe(true);

    const kept = await withSystem((tx) =>
      tx.select().from(verifiedIdentities).where(eq(verifiedIdentities.userId, renter.id)),
    );
    expect(kept).toHaveLength(1);
    expect(Object.keys(kept[0]!).sort()).toEqual(['userId', 'verifiedAt', 'verifiedName']);
    expect(kept[0]!.verifiedName).toBe('Renter 1');

    // The operator's sealed copy holds the name and the date, and nothing else.
    const check = await identityCheckOf(member, ids[0]!);
    expect(Object.keys(openJson<Record<string, unknown>>(check.resultSealed!)).sort()).toEqual([
      'verifiedAt',
      'verifiedName',
    ]);

    // No event, in the letting's record or the profile's, holds the name or any detail of it.
    const letting = await withOrg(member.organisationId, (tx) => tx.select().from(events));
    const own = await withPerson(renter.id, (tx) =>
      tx.select().from(profileEvents).where(eq(profileEvents.userId, renter.id)),
    );
    const logged = JSON.stringify([...letting.map((e) => e.data), ...own.map((e) => e.data)]);
    expect(logged).not.toContain('Renter 1');
    for (const word of ['document', 'passport', 'licence', 'country', 'birth', 'image', 'selfie']) {
      expect(logged.toLowerCase()).not.toContain(word);
    }
    expect(own.map((e) => e.type)).toContain('profile.identity_kept');
  });
});

describe('UX-PF-8: "Keep this, so you never have to do it again?"', () => {
  it('UX-PF-8: a passed check is kept only when the person chooses, and is then not asked about again', async () => {
    const { token } = await chosen();
    const renter = await createTestPerson({ name: 'Renter 1' });
    expect(await keepQuestionFor(token, renter.id)).toBeNull();
    await passIdCheck(token, 'Renter 1');
    // Passing keeps nothing on the profile.
    expect(await keptIdentityOf(renter.id)).toBeNull();
    expect(await keepQuestionFor(token, renter.id)).toMatchObject({ verifiedName: 'Renter 1' });
    expect(await keepQuestionFor(token, null)).toMatchObject({ verifiedName: 'Renter 1' });

    await keepPassedIdentity(token, renter.id);
    const kept = await keptIdentityOf(renter.id);
    expect(kept).toEqual(await passedIdentityFor(token));
    expect(await keepQuestionFor(token, renter.id)).toBeNull();
  });
});

describe('UX-PF-12: used again only at the checks stage, with the renter’s yes each time', () => {
  it('UX-PF-12: at the next home’s checks the operator sees it only once the renter says yes', async () => {
    const renter = await createTestPerson({ name: 'Renter 1' });
    await verifyForTest(renter.id, 'Renter 1', new Date('2026-10-03T10:00:00Z'));
    const { member, lettingId, ids, token } = await chosen();

    // Chosen, with checks: still nothing about it reaches the operator.
    const before = await identityCheckOf(member, ids[0]!);
    expect(before).toMatchObject({ status: 'to_do', resultSealed: null });
    const results = await withOrg(member.organisationId, (tx) => checkResultsFor(tx, [ids[0]!]));
    expect(results.get(ids[0]!)!.find((c) => c.kind === 'identity')!.verifiedName).toBeUndefined();
    expect(await whatTheOperatorSees(member, lettingId)).not.toContain('2026-10-03');

    // The renter's own page offers it, from their profile.
    expect(
      identityStep({
        kept: await keptIdentityOf(renter.id),
        applicationName: 'Renter 1',
        doAgain: false,
      }).step,
    ).toBe('use_kept');

    expect(await reuseKeptIdentity(token, renter.id)).toEqual({ ok: true });
    const after = await identityCheckOf(member, ids[0]!);
    expect(after.status).toBe('passed');
    const seen = await withOrg(member.organisationId, (tx) => checkResultsFor(tx, [ids[0]!]));
    expect(seen.get(ids[0]!)!.find((c) => c.kind === 'identity')!.verifiedName).toBe('Renter 1');
    const [completed] = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(events)
        .where(and(eq(events.type, 'check.completed'), eq(events.subjectId, after.id))),
    );
    expect(completed!.data).toMatchObject({ outcome: 'passed', kept: true });
    // Used once is not consent for the next: it's still theirs, and asked again next time.
    expect(await keptIdentityOf(renter.id)).not.toBeNull();
    expect(await reuseKeptIdentity(token, renter.id)).toEqual({ ok: false, problem: 'done' });
  });

  it('UX-PF-12: no operator’s path can read who is verified, before choosing or after', async () => {
    const renter = await createTestPerson({ name: 'Renter 1' });
    await verifyForTest(renter.id, 'Renter 1', new Date('2026-10-03T10:00:00Z'));
    const member = await createTestMember();
    const { lettingId, ids } = await peopleWhoApplied(member, [5200, 4800]);
    // The renter's application is theirs (as on their own page), and nobody is chosen yet.
    const seen = await withOrg(member.organisationId, async (tx) => ({
      all: await tx.select().from(verifiedIdentities),
      theirs: await tx
        .select()
        .from(verifiedIdentities)
        .where(eq(verifiedIdentities.userId, renter.id)),
      running: await tx.select().from(identityChecks),
    }));
    expect(seen).toEqual({ all: [], theirs: [], running: [] });
    const page = await whatTheOperatorSees(member, lettingId);
    expect(page).not.toContain('2026-10-03');
    expect(page).not.toMatch(/verified(Name|At)|identityVerified/);
    // Nothing on any application says so either.
    const rows = await withOrg(member.organisationId, (tx) =>
      tx.select().from(applications).where(eq(applications.id, ids[0]!)),
    );
    expect(JSON.stringify(rows)).not.toMatch(/verified/i);
    // Writing is refused as surely as reading.
    await expect(
      withOrg(member.organisationId, (tx) =>
        tx
          .insert(verifiedIdentities)
          .values({ userId: renter.id, verifiedName: 'X', verifiedAt: new Date() }),
      ),
    ).rejects.toThrow();
  });

  it('UX-PF-12: a renter who says no does the check with the provider, as if nothing were kept', async () => {
    const renter = await createTestPerson({ name: 'Renter 1' });
    await verifyForTest(renter.id, 'Renter 1', new Date('2026-10-03T10:00:00Z'));
    const { member, ids, token } = await chosen();
    expect(
      identityStep({
        kept: await keptIdentityOf(renter.id),
        applicationName: 'Renter 1',
        doAgain: true,
      }).step,
    ).toBe('provider');
    await passIdCheck(token, 'Renter 1', new Date('2026-11-17T10:00:00Z'));
    expect((await identityCheckOf(member, ids[0]!)).status).toBe('passed');
    // The new one is offered to keep, in place of the old.
    expect(await keepQuestionFor(token, renter.id)).toMatchObject({
      verifiedAt: new Date('2026-11-17T10:00:00Z'),
    });
  });
});

describe('UX-PF-14: the verified name and the name on the application', () => {
  it('UX-PF-14: a kept name that isn’t the application’s isn’t used unless the renter uses it on the application', async () => {
    const renter = await createTestPerson({ name: 'Renter Kelly' });
    await verifyForTest(renter.id, 'Renter Kelly');
    const { member, ids, token } = await chosen();
    expect(await reuseKeptIdentity(token, renter.id)).toEqual({ ok: false, problem: 'name' });
    expect((await identityCheckOf(member, ids[0]!)).status).toBe('to_do');

    expect(await reuseKeptIdentity(token, renter.id, { useVerifiedName: true })).toEqual({
      ok: true,
    });
    const [application] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(applications).where(eq(applications.id, ids[0]!)),
    );
    expect(application!.fullName).toBe('Renter Kelly');
  });
});

describe('UX-PF-13: nobody is invited to verify before an operator has chosen them', () => {
  it('UX-PF-13: a renter can’t start an ID check of their own, and an unchosen applicant has none', async () => {
    const renter = await createTestPerson();
    expect(await startPersonCheck(renter.id, 'go_live', '/lettings')).toEqual({
      problem: 'not_allowed',
    });
    expect(await startPersonCheck(renter.id, 'name_changed', '/profile')).toEqual({
      problem: 'not_allowed',
    });
    const { member, ids } = await chosen();
    const unchosen = await withOrg(member.organisationId, (tx) =>
      tx.select().from(checks).where(eq(checks.applicationId, ids[2]!)),
    );
    expect(unchosen).toEqual([]);
  });
});

describe('UX-TS-1, UX-TS-2: a private landlord confirms it’s them before their first home goes live', () => {
  it('UX-TS-1: an unverified private landlord’s home can’t go live, so it has no page and isn’t in search', async () => {
    const member = await createTestMember({
      kind: 'private_landlord',
      name: 'Mary Byrne',
      organisation: 'Mary',
      confirmed: false,
    });
    await expect(aLiveLetting(member)).rejects.toThrow(/confirm it’s you/);

    // Verified, it goes live and shows "Identity verified".
    const started = await startPersonCheck(member.userId, 'go_live', '/lettings');
    await recordProviderResult(checkIdIn(started), {
      kind: 'identity',
      result: { verified: true, verifiedName: 'Mary Byrne' },
    });
    expect(await personCheckOf(member.userId)).toBeNull();
    const { lettingId } = await aLiveLetting(member);
    await addPhoto(member, lettingId, aPng([36, 99, 168]));
    const [{ ref } = { ref: '' }] = await withOrg(member.organisationId, (tx) =>
      tx.select({ ref: lettings.publicRef }).from(lettings).where(eq(lettings.id, lettingId)),
    );
    const [home] = await publicHomes({ ref });
    expect(home!.lister).toEqual({ kind: 'landlord', name: 'Mary', identityVerified: true });

    // Its identity gone (the profile deleted), the home is off Gaff at once.
    await deleteProfile(
      { id: member.userId, name: 'Mary Byrne', email: member.email, emailVerified: true },
      await confirmedFor(member.userId),
    );
    expect(await publicHomes({ ref })).toEqual([]);
  });

  it('UX-TS-2: a check that doesn’t pass leaves a reason code and nothing else; trying again is allowed', async () => {
    const member = await createTestMember({ kind: 'private_landlord', confirmed: false });
    const started = await startPersonCheck(member.userId, 'go_live', '/lettings');
    await recordProviderResult(checkIdIn(started), {
      kind: 'identity',
      result: { verified: false, reason: 'face_mismatch' },
    });
    expect(await personCheckOf(member.userId)).toEqual({
      status: 'not_passed',
      reason: 'face_mismatch',
    });
    expect(await keptIdentityOf(member.userId)).toBeNull();
    expect('redirectUrl' in (await startPersonCheck(member.userId, 'go_live', '/lettings'))).toBe(
      true,
    );
  });

  it('UX-TS-1: the public query’s SQL twin agrees with the gate for every kind of lister', async () => {
    const at = new Date();
    const cases = [
      { kind: 'agency', psraLicenceNumber: '001234', confirmedAt: at, licenceLapsedAt: null },
      { kind: 'agency', psraLicenceNumber: '001234', confirmedAt: null, licenceLapsedAt: null },
      { kind: 'agency', psraLicenceNumber: '001234', confirmedAt: at, licenceLapsedAt: at },
      { kind: 'agency', psraLicenceNumber: null, confirmedAt: at, licenceLapsedAt: null },
      { kind: 'landlord', psraLicenceNumber: null, confirmedAt: null, licenceLapsedAt: null },
      {
        kind: 'private_landlord',
        psraLicenceNumber: null,
        confirmedAt: null,
        licenceLapsedAt: null,
      },
    ] as const;
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    await addPhoto(member, lettingId, aPng([36, 99, 168]));
    const [{ ref } = { ref: '' }] = await withOrg(member.organisationId, (tx) =>
      tx.select({ ref: lettings.publicRef }).from(lettings).where(eq(lettings.id, lettingId)),
    );
    for (const lister of cases) {
      for (const identityVerifiedAt of [null, at]) {
        await db()
          .update(organisations)
          .set({ ...lister, identityVerifiedAt })
          .where(eq(organisations.id, member.organisationId));
        const shown = (await publicHomes({ ref })).length === 1;
        expect([lister.kind, identityVerifiedAt !== null, shown]).toEqual([
          lister.kind,
          identityVerifiedAt !== null,
          goLiveGate({ ...lister, identityVerifiedAt }).open,
        ]);
      }
    }
  });

  it('UX-TS-2: an agency never does it, and its gate never asks', async () => {
    const member = await createTestMember();
    expect(await startPersonCheck(member.userId, 'go_live', '/lettings')).toEqual({
      problem: 'not_allowed',
    });
  });
});

describe('UX-PF-11: one identity, in every role', () => {
  it('UX-PF-11: a private landlord who verified at go-live isn’t checked again as a chosen renter', async () => {
    const landlord = await createTestMember({
      kind: 'private_landlord',
      name: 'Renter 1',
      confirmed: false,
    });
    const started = await startPersonCheck(landlord.userId, 'go_live', '/lettings');
    await recordProviderResult(checkIdIn(started), {
      kind: 'identity',
      result: { verified: true, verifiedName: 'Renter 1' },
    });
    const { member, ids, token } = await chosen();
    expect(await reuseKeptIdentity(token, landlord.userId)).toEqual({ ok: true });
    expect((await identityCheckOf(member, ids[0]!)).status).toBe('passed');
  });

  it('UX-PF-11: a renter who kept theirs isn’t checked again when they let their own home', async () => {
    const { token } = await chosen();
    const renter = await createTestPerson({ name: 'Renter 1' });
    await passIdCheck(token, 'Renter 1');
    await keepPassedIdentity(token, renter.id);
    const { organisationId } = await ensureOwnHomes(renter);
    const [own] = await db()
      .select({ at: organisations.identityVerifiedAt })
      .from(organisations)
      .where(eq(organisations.id, organisationId));
    expect(own!.at).toEqual((await keptIdentityOf(renter.id))!.verifiedAt);
    const member = (await import('@/server/auth/member')).findMember;
    const landlord = (await member(renter.id))!;
    const id = (await import('@/server/lettings/create-letting')).createLetting;
    const { lettingId } = await id(landlord, (await import('../fixtures/lettings')).aLetting());
    await recordRentCheck(landlord, lettingId, { lastLet: 'never' }, 185_000);
    expect((await goLiveStepFor(landlord, (await getLetting(landlord, lettingId))!)).gate).toEqual({
      open: true,
    });
    expect(await startTakingEnquiries(landlord, lettingId)).toBe('live');
  });
});

describe('UX-PF-9: no expiry; it goes with the profile, and can be done again', () => {
  it('UX-PF-9: "My name has changed" replaces the one kept; deleting the profile removes it at once', async () => {
    const renter = await createTestPerson({ name: 'Renter 1' });
    await verifyForTest(renter.id, 'Renter 1', new Date('2026-10-03T10:00:00Z'));
    const started = await startPersonCheck(renter.id, 'name_changed', '/profile');
    await recordProviderResult(
      checkIdIn(started),
      { kind: 'identity', result: { verified: true, verifiedName: 'Renter Kelly' } },
      new Date('2026-11-17T10:00:00Z'),
    );
    expect(await keptIdentityOf(renter.id)).toEqual({
      verifiedName: 'Renter Kelly',
      verifiedAt: new Date('2026-11-17T10:00:00Z'),
    });
    expect((await profileForDownload(renter)).identity).toEqual({
      verifiedName: 'Renter Kelly',
      verifiedAt: new Date('2026-11-17T10:00:00Z'),
    });

    await deleteProfile(renter, await confirmedFor(renter.id));
    const left = await withSystem(async (tx) => ({
      kept: await tx
        .select()
        .from(verifiedIdentities)
        .where(eq(verifiedIdentities.userId, renter.id)),
      running: await tx.select().from(identityChecks).where(eq(identityChecks.userId, renter.id)),
    }));
    expect(left).toEqual({ kept: [], running: [] });
  });
});
