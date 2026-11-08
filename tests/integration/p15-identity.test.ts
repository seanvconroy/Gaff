import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg, withRenter, withSystem } from '@/db/client';
import {
  applications,
  checks,
  events,
  identityChecks,
  letterChecks,
  platformEvents,
  users,
} from '@/db/schema';
import { chooseApplicants } from '@/server/applications/choose';
import { checkResultsFor } from '@/server/checks/checks';
import {
  identityOf,
  recordIdentityOutcome,
  refreshCopies,
  startIdentity,
} from '@/server/identity/identity';
import { inPersonIdentity, recordIdSeenInPerson } from '@/server/identity/in-person';
import {
  claimApplication,
  renterIdentityOffline,
  startRenterIdentity,
} from '@/server/identity/renter';
import { confirmIdentityByStaff, offlineIdentityQueue } from '@/server/identity/staff';
import { heldListings, resolveHold } from '@/server/listings/holds';
import { publishListing } from '@/server/listings/publish';
import { identityOffline } from '@/server/verification/identity';
import { letterReadiness } from '@/server/verification/readiness';
import {
  createTestMember,
  peopleWhoApplied,
  queuedJobs,
  tokenInMessage,
  type Member,
} from './helpers';
import { checkIdIn, checkIdentity } from './identity-helpers';
import { aCheckedLandlord, aListableLetting, aStaffMember } from './listing-helpers';

/** A letting where three applied, and the first two were chosen (R18). */
async function chosenRenter() {
  const member = await createTestMember();
  const { lettingId, ids } = await peopleWhoApplied(member, [5200, 4800, 6000]);
  await chooseApplicants(member, lettingId, { preferredId: ids[0]!, backupId: ids[1]! });
  const token = await tokenInMessage(member, ids[0]!, 'checks_invitation');
  const [application] = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ email: applications.email, fullName: applications.fullName })
      .from(applications)
      .where(eq(applications.id, ids[0]!)),
  );
  return { member, lettingId, ids, token, ...application! };
}

/** The account a renter gets by confirming their email with a code (M76). */
async function anAccount(email: string) {
  const id = crypto.randomUUID();
  await db().insert(users).values({ id, name: '', email, emailVerified: true });
  return { id, email };
}

async function identityCheckOf(member: Member, applicationId: string) {
  const results = await withOrg(member.organisationId, (tx) =>
    checkResultsFor(tx, [applicationId]),
  );
  return results.get(applicationId)!.find((c) => c.kind === 'identity')!;
}

/** The renter starts their check from their checks page, and "Stripe" decides it. */
async function renterChecks(
  token: string,
  userId: string,
  options: { selfie: boolean; first?: string; last?: string },
) {
  const started = await startRenterIdentity(token, userId, {
    selfie: options.selfie,
    consented: options.selfie,
  });
  if (!('redirectUrl' in started)) throw new Error(`not started: ${started.problem}`);
  const checkId = checkIdIn(started.redirectUrl);
  await recordIdentityOutcome({
    checkId,
    userId,
    outcome: {
      status: 'passed',
      verifiedName: { first: options.first ?? 'Renter', last: options.last ?? '1' },
    },
  });
  return checkId;
}

describe('P15, P16, P29: a chosen renter checks their identity once', () => {
  it('P16: only the application’s own email claims it', async () => {
    const { token, email } = await chosenRenter();
    const someoneElse = await anAccount(`someone.${crypto.randomUUID().slice(0, 6)}@example.ie`);
    expect(await claimApplication(token, someoneElse)).toBe(false);
    const renter = await anAccount(email);
    expect(await claimApplication(token, renter)).toBe(true);
    // Once claimed, it's theirs: another account with the same address can't take it over.
    expect(await claimApplication(token, { ...someoneElse, email })).toBe(false);
    expect(
      await startRenterIdentity(token, someoneElse.id, { selfie: false, consented: false }),
    ).toEqual({ problem: 'not_yours' });
  });

  it('P15, P21, P23: the letter sees that it’s checked and the verified name, nothing else', async () => {
    const { member, ids, token, email } = await chosenRenter();
    const renter = await anAccount(email);
    await claimApplication(token, renter);
    expect((await identityCheckOf(member, ids[0]!)).status).toBe('to_do');
    await renterChecks(token, renter.id, { selfie: true });

    const check = await identityCheckOf(member, ids[0]!);
    expect(check).toMatchObject({
      status: 'passed',
      verifiedName: 'Renter 1',
      selfie: true,
      inPersonNeeded: false,
      nameDiffers: false,
    });
    expect(check.checkedAt).toBeInstanceOf(Date);
    // The backup, who hasn't checked, is untouched; nobody else has an identity check at all.
    expect((await identityCheckOf(member, ids[1]!)).status).toBe('to_do');
    const [raw] = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(checks)
        .where(and(eq(checks.applicationId, ids[0]!), eq(checks.kind, 'identity'))),
    );
    expect(raw!.resultSealed).toMatch(/^v1:/);
    expect(raw!.providerRef).toBeNull();

    const shared = await withOrg(member.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.type, 'identity.shared')),
    );
    expect(shared.map((e) => e.data)).toEqual([
      { applicationId: ids[0], checkId: raw!.id, outcome: 'checked' },
    ]);
  });

  it('P29: chosen again for another home, they’re never asked again', async () => {
    const first = await chosenRenter();
    const renter = await anAccount(first.email);
    await claimApplication(first.token, renter);
    await renterChecks(first.token, renter.id, { selfie: true });

    // The same person, chosen by a different letter for a different home.
    const second = await chosenRenter();
    await withOrg(second.member.organisationId, (tx) =>
      tx
        .update(applications)
        .set({ email: first.email, emailNormalised: first.email.toLowerCase() })
        .where(eq(applications.id, second.ids[0]!)),
    );
    expect(await claimApplication(second.token, renter)).toBe(true);
    expect(await identityCheckOf(second.member, second.ids[0]!)).toMatchObject({
      status: 'passed',
      verifiedName: 'Renter 1',
    });
    expect(
      await startIdentity(renter.id, { selfie: true, consented: true, returnTo: 'renter' }),
    ).toEqual({ problem: 'checked' });
    // Each letter sees only their own application: the first letting's checks stay with it.
    const theirs = await withOrg(second.member.organisationId, (tx) =>
      tx.select().from(checks).where(eq(checks.applicationId, first.ids[0]!)),
    );
    expect(theirs).toEqual([]);
  });

  it('P22: a verified name that isn’t the one they gave is shown, never as a failure', async () => {
    const { member, ids, token, email } = await chosenRenter();
    const renter = await anAccount(email);
    await claimApplication(token, renter);
    await renterChecks(token, renter.id, { selfie: true, first: 'Áine', last: 'Ní Bhriain' });
    expect(await identityCheckOf(member, ids[0]!)).toMatchObject({
      status: 'passed',
      nameDiffers: true,
    });
  });
});

describe('P18 to P20, P25, P27: other ways to check', () => {
  it('P19, P27: without a selfie, the letter sees their photo ID before the agreement', async () => {
    const { member, ids, token, email } = await chosenRenter();
    const renter = await anAccount(email);
    await claimApplication(token, renter);
    await renterChecks(token, renter.id, { selfie: false });
    expect(await identityCheckOf(member, ids[0]!)).toMatchObject({
      status: 'passed',
      selfie: false,
      inPersonNeeded: true,
    });
    expect(await inPersonIdentity(member, ids[0]!)).toEqual({
      needed: true,
      why: 'no_selfie',
      seen: null,
    });

    await expect(recordIdSeenInPerson(member, ids[0]!, ' ')).rejects.toThrow(/name on their/);
    await recordIdSeenInPerson(member, ids[0]!, 'Renter One');
    const seen = await inPersonIdentity(member, ids[0]!);
    expect(seen?.seen?.name).toBe('Renter One');
    expect((await identityCheckOf(member, ids[0]!)).seenInPerson?.name).toBe('Renter One');
    const logged = await withOrg(member.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.type, 'check.recorded_in_person')),
    );
    expect(logged).toHaveLength(1);
    expect(logged[0]!.actorId).toBe(member.userId);
    expect(JSON.stringify(logged[0]!.data)).not.toContain('Renter');
    // One letter's sighting stays with that letting: the person's own record is unchanged.
    expect(await identityOf(renter.id)).toMatchObject({ status: 'verified', selfie: false });
  });

  it('P20: an ID that can’t be checked online: the renter carries on, and the letter sees it', async () => {
    const { member, ids, token, email } = await chosenRenter();
    const renter = await anAccount(email);
    await claimApplication(token, renter);
    expect(await renterIdentityOffline(token, renter.id)).toBe(true);
    expect(await identityCheckOf(member, ids[0]!)).toMatchObject({
      status: 'passed',
      inPersonNeeded: true,
    });
    expect((await identityCheckOf(member, ids[0]!)).verifiedName).toBeUndefined();
    expect(await inPersonIdentity(member, ids[0]!)).toMatchObject({ needed: true, why: 'offline' });
  });

  it('P18: declining Stripe’s own consent leads to the check without a selfie, not a failure', async () => {
    const member = await createTestMember({ kind: 'landlord' });
    const started = await startIdentity(member.userId, {
      selfie: true,
      consented: true,
      returnTo: 'letter',
    });
    const checkId = checkIdIn((started as { redirectUrl: string }).redirectUrl);
    await recordIdentityOutcome({
      checkId,
      userId: member.userId,
      outcome: { status: 'failed', reason: 'gave_up', consentDeclined: true },
    });
    expect(await identityOf(member.userId)).toMatchObject({
      status: 'not_verified',
      selfie: false,
      attempts: 0,
      attemptsLeft: 3,
    });
    const consented = await withSystem((tx) =>
      tx.select().from(platformEvents).where(eq(platformEvents.subjectId, checkId)),
    );
    expect(consented.map((e) => e.type)).toEqual(
      expect.arrayContaining(['identity.consented', 'identity.started', 'identity.decided']),
    );
    for (const event of consented) expect(JSON.stringify(event.data)).not.toMatch(/Mary|Walsh/);
  });

  it('P25: three tries at most, then “can’t be checked online”', async () => {
    const member = await createTestMember({ kind: 'landlord' });
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await checkIdentity(member.userId, {
        returnTo: 'letter',
        outcome: { status: 'failed', reason: 'document' },
      });
    }
    expect(await identityOf(member.userId)).toMatchObject({ status: 'offline', attempts: 3 });
    expect(
      await startIdentity(member.userId, { selfie: false, consented: false, returnTo: 'letter' }),
    ).toEqual({ problem: 'no_attempts_left' });
  });

  it('P26: a Stripe session is redacted 30 days after its result; the stand-in has none', async () => {
    const member = await createTestMember({ kind: 'landlord' });
    const started = await startIdentity(member.userId, {
      selfie: false,
      consented: false,
      returnTo: 'letter',
    });
    const checkId = checkIdIn((started as { redirectUrl: string }).redirectUrl);
    await withRenter(member.userId, (tx) =>
      tx
        .update(identityChecks)
        .set({ provider: 'stripe', providerRef: `vs_test_${checkId.slice(0, 8)}` })
        .where(eq(identityChecks.id, checkId)),
    );
    const now = new Date();
    await recordIdentityOutcome({
      checkId,
      userId: member.userId,
      outcome: { status: 'passed', verifiedName: { first: 'Mary', last: 'Walsh' } },
      now,
    });
    const jobs = await queuedJobs('redact_identity');
    expect(jobs).toContainEqual(expect.objectContaining({ userId: member.userId, checkId }));
  });
});

describe('P15, P20, P24, Q55: letters', () => {
  it('Q55: a letter whose ID can’t be checked online waits for a person at Gaff', async () => {
    const member = await createTestMember({ kind: 'landlord', name: 'Nóra Ward' });
    await identityOffline(member);
    expect((await letterReadiness(member)).missing).toContain('identity');
    const staff = await aStaffMember();
    const queue = await offlineIdentityQueue(staff);
    expect(queue.map((q) => q.userId)).toContain(member.userId);

    await expect(
      confirmIdentityByStaff(staff, member.userId, { first: 'Nóra', last: '' }),
    ).rejects.toThrow(/first and last name/);
    await confirmIdentityByStaff(staff, member.userId, { first: 'Nóra', last: 'Ward' });
    expect((await letterReadiness(member)).missing).not.toContain('identity');
    expect((await offlineIdentityQueue(staff)).map((q) => q.userId)).not.toContain(member.userId);
    const [copy] = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(letterChecks)
        .where(and(eq(letterChecks.userId, member.userId), eq(letterChecks.method, 'id_document'))),
    );
    expect(copy).toMatchObject({ status: 'passed', verifiedName: 'Nóra Ward' });
  });

  it('Q48: a landlord’s check moved over keeps its name, sealed onto their record when needed', async () => {
    const member = await createTestMember({ kind: 'landlord' });
    // As migration 0036 leaves it: the person's record without a name, the workspace's copy with one.
    await withRenter(member.userId, (tx) =>
      tx.insert(identityChecks).values({
        userId: member.userId,
        status: 'verified',
        selfie: true,
        provider: 'stripe',
        providerRef: 'vs_moved_over',
        attempts: 1,
        checkedAt: new Date(),
      }),
    );
    await withOrg(member.organisationId, (tx) =>
      tx.insert(letterChecks).values({
        organisationId: member.organisationId,
        userId: member.userId,
        method: 'id_document',
        status: 'passed',
        verifiedName: 'Mary Ann Walsh',
        checkedAt: new Date(),
      }),
    );
    await refreshCopies(member.userId);
    const [copy] = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(letterChecks)
        .where(and(eq(letterChecks.userId, member.userId), eq(letterChecks.method, 'id_document'))),
    );
    expect(copy).toMatchObject({ status: 'passed', verifiedName: 'Mary Ann Walsh' });
    expect((await identityOf(member.userId))?.verifiedName).toEqual({
      first: 'Mary',
      last: 'Ann Walsh',
    });
  });

  it('P24: someone already checked is checked in a workspace they create later', async () => {
    const id = crypto.randomUUID();
    await db()
      .insert(users)
      .values({ id, name: '', email: `${id}@example.ie`, emailVerified: true });
    await checkIdentity(id, { returnTo: 'renter' });
    const { createOrganisation } = await import('@/server/organisations/create-organisation');
    const { findMember } = await import('@/server/auth/member');
    await createOrganisation(id, {
      yourName: 'Mary Walsh',
      name: `Walsh ${id.slice(0, 6)}`,
      kind: 'landlord',
      psraLicenceNumber: undefined,
    });
    const member = (await findMember(id))!;
    expect((await letterReadiness(member)).missing).not.toContain('identity');
  });

  it('P19: a letter checked without a selfie has their first listing reviewed, then not', async () => {
    const member = await aCheckedLandlord({ selfie: false });
    const first = await aListableLetting(member);
    const held = await publishListing(member, first.lettingId, { declare: true });
    expect(held).toEqual({ outcome: 'held', reasons: ['first_listing_review'] });

    // Once a person at Gaff has let one go live, the next goes live at once.
    const staff = await aStaffMember();
    const hold = (await heldListings(staff)).find((h) => h.lettingId === first.lettingId)!;
    expect(hold.reasons).toEqual(['first_listing_review']);
    await resolveHold(staff, hold.holdId, { outcome: 'released' });
    const second = await aListableLetting(member);
    expect(await publishListing(member, second.lettingId, { declare: true })).toMatchObject({
      outcome: 'live',
    });
  });

  it('P19: checked with a selfie, the first listing goes live at once', async () => {
    const member = await aCheckedLandlord();
    const { lettingId } = await aListableLetting(member);
    expect(await publishListing(member, lettingId, { declare: true })).toMatchObject({
      outcome: 'live',
    });
  });
});
