import { and, asc, eq, sql } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db, withOrg, withSystem } from '@/db/client';
import {
  devOutbox,
  events,
  lettings,
  listerPauses,
  listingCases,
  organisations,
  users,
} from '@/db/schema';
import { BURST_HOMES } from '@/domain/listings/checks';
import { resetEnvForTests } from '@/lib/env';
import { sendAccountEmail } from '@/server/accounts/emails';
import { type Staff, staffFrom } from '@/server/auth/staff';
import { resolvePublicHome } from '@/server/homes/public-homes';
import { createLetting } from '@/server/lettings/create-letting';
import { goLiveGateFor, setOnGaff, startTakingEnquiries } from '@/server/lettings/go-live';
import { addPhoto } from '@/server/lettings/photos';
import { recordRentCheck } from '@/server/lettings/rent-check';
import { setCriteria } from '@/server/lettings/set-criteria';
import { addViewingSession } from '@/server/lettings/viewing-sessions';
import { checkListing, openHoldFor } from '@/server/trust/checks';
import { askToLookAgain } from '@/server/trust/look-again';
import {
  askToLookAgainAtPause,
  decidePauseAppeal,
  liftPause,
  pauseFor,
  pauseListings,
  purgeListerPauses,
} from '@/server/trust/pauses';
import { casesFor, decideCase } from '@/server/trust/staff';
import { aLetting, aViewingSession } from '../fixtures/lettings';
import { aDetailedPng, aPng } from '../fixtures/photos';
import { createTestMember, queuedJobs, type Member } from './helpers';

/**
 * BA-10 (the live line's M29, M48, M97, M98, M107; P12 to P14): every home is checked as it goes
 * public on gaff.ie, and again when a public home's words, photos or rent change. A risk signal
 * holds it for a person on Gaff's team, as a case; the person releases it or keeps it off with
 * reasons, and the lister can appeal once. A person may pause a lister's listings after a
 * decided case. Made-up homes, people and photos only.
 */

async function aStaffMember(email = 'founder@staff.gaff.test'): Promise<Staff> {
  await db()
    .insert(users)
    .values({ id: crypto.randomUUID(), name: 'Gaff Staff', email, emailVerified: true })
    .onConflictDoNothing();
  const [user] = await db().select().from(users).where(eq(users.email, email));
  const staff = staffFrom(user!);
  if (!staff) throw new Error('the staff member was not made');
  return staff;
}

let streets = 0;
/** An address no other test in this file uses, so its homes are the only ones by that name. */
function anAddress(): string {
  streets += 1;
  return `${streets} Check Street`;
}

/**
 * A home set up and ready, with these photos, that its member then puts live through the real
 * go-live step: so the checks run as it goes public.
 */
async function aHomeGoingLive(
  member: Member,
  options: { photos?: Buffer[]; overrides?: Partial<Record<string, string>> } = {},
) {
  const facts = aLetting({ addressLine1: anAddress(), ...options.overrides });
  const { lettingId } = await createLetting(member, facts);
  await addViewingSession(member, lettingId, aViewingSession());
  await setCriteria(member, lettingId, { maxOccupants: 3, noPets: true });
  await recordRentCheck(member, lettingId, { lastLet: 'never' }, facts.rent);
  for (const photo of options.photos ?? [aPng([36, 99, 168])]) {
    const added = await addPhoto(member, lettingId, photo);
    if (!added.ok) throw new Error(`photo not added: ${added.problem}`);
  }
  const outcome = await startTakingEnquiries(member, lettingId);
  const [row] = await withOrg(member.organisationId, (tx) =>
    tx.select().from(lettings).where(eq(lettings.id, lettingId)),
  );
  return { lettingId, ref: row!.publicRef, outcome, letting: row! };
}

async function holdsOn(lettingId: string) {
  return withSystem((tx) =>
    tx
      .select()
      .from(listingCases)
      .where(and(eq(listingCases.lettingId, lettingId), eq(listingCases.kind, 'hold')))
      .orderBy(asc(listingCases.openedAt)),
  );
}

async function lettingOf(member: Member, lettingId: string) {
  const [row] = await withOrg(member.organisationId, (tx) =>
    tx.select().from(lettings).where(eq(lettings.id, lettingId)),
  );
  return row!;
}

async function recordOf(member: Member, lettingId: string, type: string) {
  return withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(events)
      .where(and(eq(events.lettingId, lettingId), eq(events.type, type)))
      .orderBy(asc(events.occurredAt)),
  );
}

async function isPublic(ref: string): Promise<boolean> {
  return (await resolvePublicHome(ref)) !== null;
}

/** The account emails queued for this letting, of this kind. */
async function emailsQueued(kind: string, lettingId: string) {
  return (await queuedJobs('send_account_email')).filter(
    (job) => job.kind === kind && job.lettingId === lettingId,
  );
}

const hide = (caseId: string, reason = 'scam', facts = ['checks', 'photos']) => ({
  caseId,
  decision: 'hide_listing',
  reason,
  facts,
});
const release = (caseId: string) => ({ caseId, decision: 'no_action' });

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});

describe('M48: a clear home goes public at once, and is checked as it does', () => {
  it('M48: a home with nothing wrong is public, with its check recorded and no case', async () => {
    const member = await createTestMember();
    const home = await aHomeGoingLive(member, { photos: [aDetailedPng(101)] });
    expect(home.outcome).toBe('live');
    expect(home.letting).toMatchObject({ hiddenAt: null, status: 'live' });
    expect(home.letting.screenedAt).not.toBeNull();
    expect(await isPublic(home.ref)).toBe(true);
    expect(await holdsOn(home.lettingId)).toEqual([]);
  });

  it('M48: a home that won’t be public isn’t checked until it is', async () => {
    const member = await createTestMember();
    const home = await aHomeGoingLive(member, { photos: [] });
    expect(home.letting.screenedAt).toBeNull();
    expect(
      await checkListing({
        organisationId: member.organisationId,
        lettingId: home.lettingId,
        part: 'all',
      }),
    ).toEqual({ outcome: 'skipped' });
  });
});

describe('M29: each risk signal holds a home for a person on Gaff’s team', () => {
  it('M29: a photo on a different lister’s home holds it; the same lister reusing their own doesn’t', async () => {
    const first = await createTestMember();
    const theirs = await aHomeGoingLive(first, { photos: [aDetailedPng(202)] });
    expect(theirs.outcome).toBe('live');
    // The same lister's own photo on another of their homes is theirs to use.
    const again = await aHomeGoingLive(first, { photos: [aDetailedPng(202)] });
    expect(again.letting.hiddenAt).toBeNull();

    const copier = await createTestMember();
    const copied = await aHomeGoingLive(copier, { photos: [aDetailedPng(202)] });
    // The person's decision to go live stands; the home isn't public, and a person will look.
    expect(copied.outcome).toBe('live');
    expect(copied.letting).toMatchObject({
      status: 'live',
      hiddenStage: 'held',
      hiddenAfter: 'check',
      hiddenReason: null,
    });
    expect(await isPublic(copied.ref)).toBe(false);
    const [hold] = await holdsOn(copied.lettingId);
    expect(hold).toMatchObject({
      kind: 'hold',
      reasons: [],
      signals: ['photo_reused'],
      findings: null,
      decision: null,
    });
    expect(hold!.heldAt).not.toBeNull();
    // A sign of a scam: within four working hours.
    expect(hold!.dueBy.getTime() - hold!.openedAt.getTime()).toBeLessThanOrEqual(4 * 86_400_000);
    // Codes and counts only, as the system.
    const [held] = await recordOf(copier, copied.lettingId, 'listing.held_by_checks');
    expect([held!.actorType, held!.data]).toEqual([
      'system',
      { caseId: hold!.id, signals: ['photo_reused'], findings: 0, grounds: [] },
    ]);
    // The lister is told at once, in fixed words, when a person will look by.
    expect(await emailsQueued('listing_checking', copied.lettingId)).toHaveLength(1);
    expect(await openHoldFor(copier.organisationId, copied.lettingId)).toEqual({
      dueBy: hold!.dueBy,
      findings: [],
    });
    // Nobody else can read the hold.
    expect(await openHoldFor(first.organisationId, copied.lettingId)).toBeNull();
  });

  it('M29: plain pictures with no detail never match another lister’s', async () => {
    const a = await createTestMember();
    const b = await createTestMember();
    await aHomeGoingLive(a, { photos: [aPng([10, 10, 10])] });
    const home = await aHomeGoingLive(b, { photos: [aPng([10, 10, 10])] });
    expect(home.letting.hiddenAt).toBeNull();
  });

  it('M29: a rent far below similar homes in the same place holds it', async () => {
    const area = 'Inchicore, Dublin 8';
    for (let i = 0; i < 5; i++) {
      const lister = await createTestMember();
      const similar = await aHomeGoingLive(lister, { overrides: { area, rent: '1,900' } });
      expect(similar.letting.hiddenAt).toBeNull();
    }
    const cheap = await aHomeGoingLive(await createTestMember(), {
      overrides: { area, rent: '900' },
    });
    expect(cheap.letting.hiddenAt).not.toBeNull();
    expect((await holdsOn(cheap.lettingId))[0]?.signals).toEqual(['rent_far_below']);
    // A fair rent nearby goes ahead.
    const fair = await aHomeGoingLive(await createTestMember(), {
      overrides: { area, rent: '1,750' },
    });
    expect(fair.letting.hiddenAt).toBeNull();
  });

  it('M29: a description copied word for word from another lister holds it', async () => {
    const description =
      'A bright two-bedroom apartment on the second floor of a quiet red-brick block, a short walk from the village and the Luas. The living room opens onto a south-facing balcony, and both bedrooms are doubles.';
    const original = await aHomeGoingLive(await createTestMember(), {
      overrides: { description },
    });
    expect(original.letting.hiddenAt).toBeNull();
    const copy = await aHomeGoingLive(await createTestMember(), {
      overrides: { description: description.toUpperCase().replace(/, /g, ',  ') },
    });
    expect((await holdsOn(copy.lettingId))[0]?.signals).toEqual(['description_copied']);
  });

  it('M29: a new account putting many homes on gaff.ie at once holds the one that makes the burst', async () => {
    const member = await createTestMember();
    for (let i = 1; i < BURST_HOMES; i++) {
      expect((await aHomeGoingLive(member)).letting.hiddenAt).toBeNull();
    }
    const burst = await aHomeGoingLive(member);
    expect((await holdsOn(burst.lettingId))[0]?.signals).toEqual(['new_account_burst']);
  });

  it('M29: wording typical of rental scams holds it', async () => {
    const home = await aHomeGoingLive(await createTestMember(), {
      overrides: {
        description: 'A lovely flat. I am working abroad, so the keys will be sent by post.',
      },
    });
    expect((await holdsOn(home.lettingId))[0]?.signals).toEqual(['scam_wording']);
  });
});

describe('P12 to P14: the AI’s wording check, after the word list', () => {
  it('P13: a finding holds it with the phrase and the ground as a code; the record has codes and counts', async () => {
    const member = await createTestMember();
    const home = await aHomeGoingLive(member, {
      overrides: { description: 'A bright two-bed apartment near the Luas. Locals preferred.' },
    });
    const [hold] = await holdsOn(home.lettingId);
    expect(hold).toMatchObject({
      signals: ['unfair_wording'],
      findings: [{ phrase: 'Locals preferred', ground: 'race' }],
    });
    // Unfair wording alone: within one working day.
    expect(hold!.dueBy.getTime()).toBeGreaterThan(hold!.openedAt.getTime() + 4 * 3_600_000 - 1);
    const [held] = await recordOf(member, home.lettingId, 'listing.held_by_checks');
    expect(held!.data).toEqual({
      caseId: hold!.id,
      signals: ['unfair_wording'],
      findings: 1,
      grounds: ['race'],
    });
    expect(JSON.stringify(held!.data)).not.toContain('Locals');
    expect(await openHoldFor(member.organisationId, home.lettingId)).toMatchObject({
      findings: [{ phrase: 'Locals preferred', ground: 'race' }],
    });
    // The usage is logged, never the words.
    const { rows } = await withSystem((tx) =>
      tx.execute<{ n: number }>(
        sql`select count(*)::int as n from ai_calls where task = 'wording' and organisation_id = ${member.organisationId}`,
      ),
    );
    expect(rows[0]!.n).toBe(1);
  });

  it('P5, P8: with the task switched off, the home goes ahead on the word list alone', async () => {
    vi.stubEnv('AI_TASKS_OFF', 'wording');
    resetEnvForTests();
    const home = await aHomeGoingLive(await createTestMember(), {
      overrides: { description: 'A bright two-bed apartment near the Luas. Locals preferred.' },
    });
    expect(home.letting.hiddenAt).toBeNull();
    expect(await isPublic(home.ref)).toBe(true);
  });
});

describe('M48: a public home is checked again when its words, photos or rent change', () => {
  it('M48: a copied photo added to a public home holds it, by the queued check', async () => {
    const original = await createTestMember();
    await aHomeGoingLive(original, { photos: [aDetailedPng(303)] });
    const member = await createTestMember();
    const home = await aHomeGoingLive(member, { photos: [aDetailedPng(304)] });
    expect(await isPublic(home.ref)).toBe(true);
    const added = await addPhoto(member, home.lettingId, aDetailedPng(303));
    expect(added.ok).toBe(true);
    const photoId = added.ok ? added.photo.id : '';
    const job = (await queuedJobs('check_listing')).find(
      (each) =>
        each.lettingId === home.lettingId &&
        (each.photoIds as string[] | undefined)?.includes(photoId),
    );
    expect(job).toMatchObject({
      organisationId: member.organisationId,
      photoIds: [expect.any(String)],
    });
    const checked = await checkListing(job as unknown as Parameters<typeof checkListing>[0]);
    expect(checked).toMatchObject({ outcome: 'held', signals: ['photo_reused'] });
    expect(await isPublic(home.ref)).toBe(false);
  });

  it('M48: switching "On gaff.ie" back on queues a check of the whole home', async () => {
    const member = await createTestMember();
    const home = await aHomeGoingLive(member);
    await setOnGaff(member, home.lettingId, false);
    await setOnGaff(member, home.lettingId, true);
    expect(
      (await queuedJobs('check_listing')).filter(
        (job) => job.lettingId === home.lettingId && job.part === 'all',
      ),
    ).toHaveLength(1);
  });
});

describe('M97, M98: a hold is a case a person decides', () => {
  it('M98: released, it’s public, with no first decision about anyone, and the same signal doesn’t hold it again', async () => {
    const staff = await aStaffMember();
    await aHomeGoingLive(await createTestMember(), { photos: [aDetailedPng(404)] });
    const member = await createTestMember();
    const home = await aHomeGoingLive(member, { photos: [aDetailedPng(404)] });
    const [hold] = await holdsOn(home.lettingId);
    const open = (await casesFor(staff)).open.find((each) => each.id === hold!.id);
    expect(open).toMatchObject({ kind: 'hold', signals: ['photo_reused'], likeliest: 'scam' });
    expect(open!.photos).toHaveLength(1);

    expect(await decideCase(staff, release(hold!.id))).toEqual({ decided: 'no_action' });
    expect(await isPublic(home.ref)).toBe(true);
    expect(await lettingOf(member, home.lettingId)).toMatchObject({
      hiddenAt: null,
      hiddenStage: null,
      hiddenAfter: null,
    });
    const released = await recordOf(member, home.lettingId, 'listing.released');
    expect(released.map((event) => [event.actorType, event.data])).toEqual([
      ['staff', { caseId: hold!.id }],
    ]);
    expect(await emailsQueued('listing_cleared', home.lettingId)).toHaveLength(1);
    // Looking at the whole home again skips what a person released...
    expect(
      await checkListing({
        organisationId: member.organisationId,
        lettingId: home.lettingId,
        part: 'all',
      }),
    ).toEqual({ outcome: 'clear' });
    // ...but a new copied photo is new evidence.
    const added = await addPhoto(member, home.lettingId, aDetailedPng(404));
    expect(added.ok).toBe(true);
    const photoId = added.ok ? added.photo.id : '';
    expect(
      await checkListing({
        organisationId: member.organisationId,
        lettingId: home.lettingId,
        part: 'photos',
        photoIds: [photoId],
      }),
    ).toMatchObject({ outcome: 'held' });
  });

  it('M98: kept off with reasons, the lister can appeal once, and someone else decides it', async () => {
    const founder = await aStaffMember();
    const second = await aStaffMember('second@staff.gaff.test');
    const member = await createTestMember();
    const home = await aHomeGoingLive(member, {
      overrides: { description: 'A flat to let. Pay before viewing and the keys come by post.' },
    });
    const [hold] = await holdsOn(home.lettingId);
    await decideCase(founder, hide(hold!.id));
    expect(await lettingOf(member, home.lettingId)).toMatchObject({
      hiddenStage: 'decided',
      hiddenReason: 'scam',
      hiddenAfter: 'check',
    });
    const [hidden] = await recordOf(member, home.lettingId, 'listing.hidden');
    expect(hidden!.data).toEqual({
      caseId: hold!.id,
      reason: 'scam',
      facts: ['checks', 'photos'],
      reports: 0,
    });
    expect(await emailsQueued('listing_not_shown', home.lettingId)).toHaveLength(1);

    expect(await askToLookAgain(member, home.lettingId)).toEqual({ asked: true });
    expect(await askToLookAgain(member, home.lettingId)).toEqual({ asked: false });
    const appeal = (await casesFor(second)).open.find(
      (each) => each.kind === 'appeal' && each.lettingId === home.lettingId,
    )!;
    await expect(decideCase(founder, release(appeal.id))).rejects.toThrow(/someone else/i);
    await decideCase(second, release(appeal.id));
    expect(await isPublic(home.ref)).toBe(true);
  });
});

describe('M107: pausing a lister’s listings after a decided case', () => {
  let seed = 500;
  async function aDecidedCase() {
    const founder = await aStaffMember();
    const member = await createTestMember();
    seed += 1;
    const other = await aHomeGoingLive(member, { photos: [aDetailedPng(seed)] });
    const home = await aHomeGoingLive(member, {
      overrides: { description: 'Deposit by Western Union before the viewing, please.' },
    });
    const [hold] = await holdsOn(home.lettingId);
    await decideCase(founder, hide(hold!.id));
    return { founder, member, other, home, caseId: hold!.id };
  }

  it('M107: only after a decided case; then none of its homes is public and none goes live, while its live lettings carry on', async () => {
    const { founder, member, other, caseId } = await aDecidedCase();
    const open = await createTestMember();
    const waiting = await aHomeGoingLive(open, { photos: [] });
    const [undecided] = await withSystem((tx) =>
      tx
        .select({ id: listingCases.id })
        .from(listingCases)
        .where(eq(listingCases.lettingId, waiting.lettingId)),
    );
    expect(undecided).toBeUndefined();
    await expect(
      pauseListings(founder, { caseId: crypto.randomUUID(), reason: 'scam', facts: ['lister'] }),
    ).rejects.toThrow(/only after a decided case/);

    expect(await isPublic(other.ref)).toBe(true);
    const { pauseId } = await pauseListings(founder, {
      caseId,
      reason: 'scam',
      facts: ['lister', 'checks'],
    });
    await expect(
      pauseListings(founder, { caseId, reason: 'scam', facts: ['lister'] }),
    ).rejects.toThrow(/paused/);
    // Off gaff.ie, everywhere: the one rule says so.
    expect(await isPublic(other.ref)).toBe(false);
    expect((await goLiveGateFor(member)).gate).toEqual({
      open: false,
      reason: 'paused',
      waits: false,
    });
    await expect(aHomeGoingLive(member)).rejects.toThrow(/paused your listings/);
    // Its live lettings carry on, with the renters already in them.
    expect((await lettingOf(member, other.lettingId)).status).toBe('live');
    // Codes and IDs only, in the lister's record.
    const [paused] = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(events)
        .where(
          and(
            eq(events.organisationId, member.organisationId),
            eq(events.type, 'organisation.listings_paused'),
          ),
        ),
    );
    expect([paused!.actorType, paused!.data]).toEqual([
      'staff',
      { pauseId, caseId, reason: 'scam', facts: ['checks', 'lister'] },
    ]);
    expect(await pauseFor(member)).toMatchObject({ reason: 'scam', appeal: 'none' });

    await liftPause(founder, pauseId);
    expect(await isPublic(other.ref)).toBe(true);
    expect(await pauseFor(member)).toBeNull();
  });

  it('M98: the lister appeals once, and someone other than the person who paused decides', async () => {
    const { founder, member, other, caseId } = await aDecidedCase();
    const second = await aStaffMember('second@staff.gaff.test');
    const { pauseId } = await pauseListings(founder, { caseId, reason: 'scam', facts: ['lister'] });
    await expect(decidePauseAppeal(second, pauseId, 'no_action')).rejects.toThrow(
      /Nobody has asked/,
    );
    expect(await askToLookAgainAtPause(member)).toEqual({ asked: true });
    expect(await askToLookAgainAtPause(member)).toEqual({ asked: false });
    expect(await pauseFor(member)).toMatchObject({ appeal: 'asked' });
    await expect(decidePauseAppeal(founder, pauseId, 'no_action')).rejects.toThrow(/someone else/i);
    await decidePauseAppeal(second, pauseId, 'hide_listing');
    expect(await pauseFor(member)).toMatchObject({ appeal: 'kept' });
    expect(await isPublic(other.ref)).toBe(false);
    // Kept is final: the appeal can't be decided again, though a person may still lift it.
    await expect(decidePauseAppeal(second, pauseId, 'no_action')).rejects.toThrow(/Nobody/);
    await liftPause(second, pauseId);
    expect(await isPublic(other.ref)).toBe(true);
  });

  it('M107, rule 9: the lister is emailed the statement, and an ended pause is deleted six months on', async () => {
    const { founder, member, caseId } = await aDecidedCase();
    const { pauseId } = await pauseListings(founder, { caseId, reason: 'scam', facts: ['lister'] });
    await sendAccountEmail({
      kind: 'listings_paused',
      organisationId: member.organisationId,
      pauseId,
    });
    const mail = await db().select().from(devOutbox).where(eq(devOutbox.toAddress, member.email));
    expect(mail.map((each) => each.subject)).toContain('Your listings on gaff.ie are paused');
    const now = new Date();
    await liftPause(founder, pauseId, now);
    expect(await purgeListerPauses(new Date(now.getTime() + 100 * 86_400_000))).toBe(0);
    expect(
      await purgeListerPauses(new Date(now.getTime() + 200 * 86_400_000)),
    ).toBeGreaterThanOrEqual(1);
    const left = await withSystem((tx) =>
      tx.select().from(listerPauses).where(eq(listerPauses.id, pauseId)),
    );
    expect(left).toEqual([]);
    // No operator can read a pause: it's Gaff's own record.
    const seen = await withOrg(member.organisationId, (tx) => tx.select().from(listerPauses));
    expect(seen).toEqual([]);
    const [org] = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ pausedAt: organisations.listingsPausedAt })
        .from(organisations)
        .where(eq(organisations.id, member.organisationId)),
    );
    expect(org!.pausedAt).toBeNull();
  });
});

describe('M48: the lister is told, in fixed words', () => {
  it('M48: the email says a person will look and by when, and quotes wording the check found', async () => {
    const member = await createTestMember();
    const home = await aHomeGoingLive(member, {
      overrides: { description: 'Two double bedrooms, gas heating. English speakers only.' },
    });
    const [job] = await emailsQueued('listing_checking', home.lettingId);
    await sendAccountEmail(job);
    const [mail] = await db()
      .select()
      .from(devOutbox)
      .where(
        and(
          eq(devOutbox.toAddress, member.email),
          eq(
            devOutbox.subject,
            `${home.letting.addressLine1} is waiting for a check before it goes on gaff.ie`,
          ),
        ),
      );
    expect(mail?.text).toContain('“English speakers only”');
    expect(mail?.text).toMatch(/A person on Gaff’s team will look at it by \w+day \d+ \w+, /);
  });
});
