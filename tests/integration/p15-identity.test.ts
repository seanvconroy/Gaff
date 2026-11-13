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
import { claimApplication, startRenterIdentity } from '@/server/identity/renter';
import { allowMoreTries, outOfTries } from '@/server/identity/staff';
import { NotVerifiedError } from '@/server/lettings/go-live';
import { publishListing } from '@/server/listings/publish';
import { letterReadiness } from '@/server/verification/readiness';
import {
  aLiveLetting,
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
  options: { first?: string; last?: string } = {},
) {
  const started = await startRenterIdentity(token, userId, { consented: true });
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

/** A letter who hasn't verified yet starts their check, with their agreement. */
async function startsTheirCheck(member: Member) {
  const started = await startIdentity(member.userId, { consented: true, returnTo: 'letter' });
  if (!('redirectUrl' in started)) throw new Error(`not started: ${started.problem}`);
  return checkIdIn(started.redirectUrl);
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
    expect(await startRenterIdentity(token, someoneElse.id, { consented: true })).toEqual({
      problem: 'not_yours',
    });
  });

  it('P15, P21, P23: the letter sees that it’s checked and the verified name, nothing else', async () => {
    const { member, ids, token, email } = await chosenRenter();
    const renter = await anAccount(email);
    await claimApplication(token, renter);
    expect((await identityCheckOf(member, ids[0]!)).status).toBe('to_do');
    await renterChecks(token, renter.id);

    const check = await identityCheckOf(member, ids[0]!);
    expect(check).toMatchObject({ status: 'passed', verifiedName: 'Renter 1', nameDiffers: false });
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
    await renterChecks(first.token, renter.id);

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
    expect(await startIdentity(renter.id, { consented: true, returnTo: 'renter' })).toEqual({
      problem: 'checked',
    });
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
    await renterChecks(token, renter.id, { first: 'Áine', last: 'Ní Bhriain' });
    expect(await identityCheckOf(member, ids[0]!)).toMatchObject({
      status: 'passed',
      nameDiffers: true,
    });
  });
});

describe('P17, P18, P25, Q60: a live selfie, with no other way through', () => {
  it('P18: a check starts only with the person’s agreement, and always asks for a selfie', async () => {
    const member = await createTestMember({ kind: 'landlord', verified: false });
    expect(await startIdentity(member.userId, { consented: false, returnTo: 'letter' })).toEqual({
      problem: 'consent_needed',
    });
    const checkId = await startsTheirCheck(member);
    const [row] = await withRenter(member.userId, (tx) =>
      tx.select().from(identityChecks).where(eq(identityChecks.id, checkId)),
    );
    expect(row).toMatchObject({ selfie: true, consentVersion: 'selfie_consent_v2' });
    expect(row!.consentedAt).toBeInstanceOf(Date);
  });

  it('P18: declining Stripe’s own consent screen doesn’t count as a try', async () => {
    const member = await createTestMember({ kind: 'landlord', verified: false });
    const checkId = await startsTheirCheck(member);
    await recordIdentityOutcome({
      checkId,
      userId: member.userId,
      outcome: { status: 'failed', reason: 'gave_up', consentDeclined: true },
    });
    expect(await identityOf(member.userId)).toMatchObject({
      status: 'not_verified',
      selfie: true,
      attempts: 0,
      attemptsLeft: 3,
    });
    const logged = await withSystem((tx) =>
      tx.select().from(platformEvents).where(eq(platformEvents.subjectId, checkId)),
    );
    expect(logged.map((e) => e.type)).toEqual(
      expect.arrayContaining(['identity.consented', 'identity.started', 'identity.decided']),
    );
    for (const event of logged) expect(JSON.stringify(event.data)).not.toMatch(/Mary|Walsh/);
  });

  it('P25: after three tries, a person at Gaff can give three more', async () => {
    const member = await createTestMember({ kind: 'landlord', verified: false });
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await checkIdentity(member.userId, {
        returnTo: 'letter',
        outcome: { status: 'failed', reason: 'document' },
      });
    }
    expect(await identityOf(member.userId)).toMatchObject({ status: 'not_verified', attempts: 3 });
    expect(await startIdentity(member.userId, { consented: true, returnTo: 'letter' })).toEqual({
      problem: 'no_attempts_left',
    });

    const staff = await aStaffMember();
    const stuck = await outOfTries(staff);
    expect(stuck.find((p) => p.userId === member.userId)).toMatchObject({ reason: 'document' });
    await allowMoreTries(staff, member.userId);
    expect(await identityOf(member.userId)).toMatchObject({ attempts: 0, attemptsLeft: 3 });
    expect((await outOfTries(staff)).map((p) => p.userId)).not.toContain(member.userId);
    await expect(allowMoreTries(staff, member.userId)).rejects.toThrow(/tries left/);
    const given = await withSystem((tx) =>
      tx.select().from(platformEvents).where(eq(platformEvents.type, 'identity.more_tries')),
    );
    expect(given.some((e) => e.actorId === staff.userId)).toBe(true);
    await checkIdentity(member.userId, { returnTo: 'letter' });
    expect((await letterReadiness(member)).missing).not.toContain('identity');
  });

  it('Q60: a check recorded without a selfie before the standard is done again, with one', async () => {
    const member = await createTestMember({ kind: 'landlord', verified: false });
    await withRenter(member.userId, (tx) =>
      tx.insert(identityChecks).values({
        userId: member.userId,
        status: 'verified',
        selfie: false,
        provider: 'stand_in',
        attempts: 1,
        checkedAt: new Date(),
      }),
    );
    await refreshCopies(member.userId);
    expect((await letterReadiness(member)).missing).toContain('identity');
    await checkIdentity(member.userId, { returnTo: 'letter' });
    expect(await identityOf(member.userId)).toMatchObject({ status: 'verified', selfie: true });
    expect((await letterReadiness(member)).missing).not.toContain('identity');
  });

  it('P26: a Stripe session is redacted 30 days after its result; the stand-in has none', async () => {
    const member = await createTestMember({ kind: 'landlord', verified: false });
    const checkId = await startsTheirCheck(member);
    await withRenter(member.userId, (tx) =>
      tx
        .update(identityChecks)
        .set({ provider: 'stripe', providerRef: `vs_test_${checkId.slice(0, 8)}` })
        .where(eq(identityChecks.id, checkId)),
    );
    await recordIdentityOutcome({
      checkId,
      userId: member.userId,
      outcome: { status: 'passed', verifiedName: { first: 'Mary', last: 'Walsh' } },
    });
    expect(await queuedJobs('redact_identity')).toContainEqual(
      expect.objectContaining({ userId: member.userId, checkId }),
    );
  });
});

describe('P15, P24, Q60: letters verify before their first letting goes live', () => {
  it('P15, Q60: a letting can’t start taking enquiries until the letter is verified', async () => {
    const member = await createTestMember({ verified: false });
    await expect(aLiveLetting(member)).rejects.toBeInstanceOf(NotVerifiedError);
    await withRenter(member.userId, async (tx) => {
      const { phoneConfirmations } = await import('@/db/schema');
      await tx.insert(phoneConfirmations).values({
        userId: member.userId,
        phone: '+353870001122',
        confirmedPhone: '+353870001122',
        confirmedAt: new Date(),
      });
    });
    await expect(aLiveLetting(member)).rejects.toBeInstanceOf(NotVerifiedError);
    await checkIdentity(member.userId, { returnTo: 'letter' });
    const { lettingId } = await aLiveLetting(member);
    expect(lettingId).toBeTruthy();
  });

  it('P15: a verified landlord’s first listing goes live at once', async () => {
    const member = await aCheckedLandlord();
    const { lettingId } = await aListableLetting(member);
    expect(await publishListing(member, lettingId, { declare: true })).toMatchObject({
      outcome: 'live',
    });
  });

  it('Q48: a landlord’s check moved over keeps its name, sealed onto their record when needed', async () => {
    const member = await createTestMember({ kind: 'landlord', verified: false });
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
});
