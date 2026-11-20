import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { recordProviderResult } from '@/server/checks/checks';
import { startPersonCheck } from '@/server/identity/person-checks';
import { localPhotoStore } from '@/adapters/photos/local';
import { db, withOrg } from '@/db/client';
import {
  applications,
  decisions,
  events,
  lettingDrafts,
  lettingPhotos,
  messages,
  organisations,
} from '@/db/schema';
import { rank } from '@/domain/ranking/rank';
import { listerFrom } from '@/domain/frame/frame';
import { MAX_HOME_PHOTOS } from '@/domain/lettings/photos';
import { needsForwarding } from '@/domain/lettings/setup';
import { listerColumns } from '@/server/frame/lister';
import { closeLetting } from '@/server/lettings/close';
import { createLetting } from '@/server/lettings/create-letting';
import {
  confirmReview,
  keepAdvertLinks,
  listDrafts,
  loadHome,
  reachStep,
  saveAnswers,
  startDraft,
} from '@/server/lettings/drafts';
import {
  goLiveStepFor,
  isShownOnGaff,
  setAdvertisedOn,
  setOnGaff,
  startTakingEnquiries,
} from '@/server/lettings/go-live';
import { letAgain } from '@/server/lettings/let-again';
import { addPhoto, removePhoto, reorderPhotos } from '@/server/lettings/photos';
import { coverPhotoHref, coverPhotoHrefsIn, getLetting } from '@/server/lettings/queries';
import {
  changeAskingRent,
  recordRentCheck,
  rentAnswersFromLettingBefore,
} from '@/server/lettings/rent-check';
import { setLettingDetails } from '@/server/lettings/set-criteria';
import { sendTestEnquiry } from '@/server/lettings/test-enquiry';
import { setListerPhone } from '@/server/organisations/phone';
import { timelineFor } from '@/server/timeline/timeline';
import { daftEnquiry } from '../fixtures/emails';
import { aLetting, daysFromToday } from '../fixtures/lettings';
import { aPng } from '../fixtures/photos';
import {
  aLiveLetting,
  createTestMember,
  databaseError,
  deliverEmail,
  type Member,
} from './helpers';

/** Work package WP-9: adding a letting, a step at a time (section 4 of the UX redesign). */

const address = {
  addressLine1: '12 Ranelagh Road',
  area: 'Ranelagh, Dublin 6',
  county: 'Dublin',
  eircode: 'D06 F2X3',
} as const;
const rent = () => ({ rentCents: 185_000, availableFrom: daysFromToday(30) });
const home = { propertyType: 'apartment', bedrooms: 2 } as const;

async function recordOf(member: Member, lettingId: string) {
  return withOrg(member.organisationId, (tx) =>
    tx
      .select({ type: events.type, data: events.data, actorType: events.actorType })
      .from(events)
      .where(eq(events.lettingId, lettingId))
      .orderBy(asc(events.id)),
  );
}

/** A home added a step at a time, as the screens do: it is a letting in set-up at the end. */
async function aHomeAdded(member: Member, more: Record<string, unknown> = {}): Promise<string> {
  const { id } = await startDraft(member, { origin: 'manual' });
  await saveAnswers(member, id, { step: 'address', patch: address, advance: true });
  await saveAnswers(member, id, { step: 'rent', patch: rent(), advance: true });
  await saveAnswers(member, id, { step: 'home', patch: { ...home, ...more }, advance: true });
  return id;
}

describe('UX-FL-2, UX-LT-5: a home is added a step at a time, and keeps one ID', () => {
  it('UX-FL-2: each step is saved as it is answered, and the draft becomes a letting when it has what one needs', async () => {
    const member = await createTestMember();
    const { id } = await startDraft(member, { origin: 'manual' });
    expect(
      await saveAnswers(member, id, { step: 'address', patch: address, advance: true }),
    ).toEqual({ kind: 'draft', next: 'rent' });
    expect(await loadHome(member, id)).toMatchObject({
      kind: 'draft',
      reached: 'rent',
      answers: address,
    });
    expect(await saveAnswers(member, id, { step: 'rent', patch: rent(), advance: true })).toEqual({
      kind: 'draft',
      next: 'home',
    });
    // The last of what a letting can't exist without (UX-LT-14): now it is one, with the same ID.
    expect(
      await saveAnswers(member, id, {
        step: 'home',
        patch: { ...home, otherFacts: ['Gas central heating'] },
        advance: true,
      }),
    ).toEqual({ kind: 'letting', next: 'photos' });
    const made = await loadHome(member, id);
    expect(made).toMatchObject({ kind: 'letting', id, reached: 'photos' });
    expect(made?.detail?.letting).toMatchObject({
      id,
      addressLine1: '12 Ranelagh Road',
      monthlyRentCents: 185_000,
      stage: 'setup',
      status: 'draft',
      // UX-LT-14: offered, never guessed.
      bathrooms: null,
      furnished: null,
      berRating: null,
    });
    expect(made?.detail?.facts.map((fact) => fact.answer)).toEqual(['Gas central heating']);
    expect(await listDrafts(member)).toEqual([]);
  });

  it('rule 8: the record says which step was answered, and never what was typed', async () => {
    const member = await createTestMember();
    const id = await aHomeAdded(member, { description: 'A bright apartment near the Luas.' });
    const record = await recordOf(member, id);
    expect(record.map((event) => [event.type, event.data])).toEqual([
      ['letting.draft_started', { origin: 'manual' }],
      ['letting.draft_saved', { step: 'address' }],
      ['letting.draft_saved', { step: 'rent' }],
      ['letting.draft_saved', { step: 'home' }],
      ['letting.created', { setupFacts: 0, withLandlord: false, origin: 'manual' }],
    ]);
    expect(record.every((event) => event.actorType === 'person')).toBe(true);
    expect(JSON.stringify(record)).not.toMatch(/Ranelagh|D06|bright|Luas/);
  });

  it('UX-FL-2: "Save and exit" keeps part of a step without moving anyone on', async () => {
    const member = await createTestMember();
    const { id } = await startDraft(member, { origin: 'manual' });
    await saveAnswers(member, id, { step: 'address', patch: address, advance: true });
    await saveAnswers(member, id, { step: 'rent', patch: { rentCents: 210_000 }, advance: false });
    expect(await loadHome(member, id)).toMatchObject({
      kind: 'draft',
      reached: 'rent',
      answers: { ...address, rentCents: 210_000 },
    });
    expect(await listDrafts(member)).toMatchObject([{ id, addressLine1: '12 Ranelagh Road' }]);
  });

  it('UX-FL-2: how far someone has got only moves forward', async () => {
    const member = await createTestMember();
    const id = await aHomeAdded(member);
    await reachStep(member, id, 'rent_check');
    await reachStep(member, id, 'photos');
    expect((await loadHome(member, id))?.reached).toBe('rent_check');
    // Going back to change the address keeps the place, and records only that it changed.
    await saveAnswers(member, id, {
      step: 'address',
      patch: { ...address, addressLine1: '14 Ranelagh Road' },
      advance: true,
    });
    const changed = await loadHome(member, id);
    expect(changed?.reached).toBe('rent_check');
    expect(changed?.answers.addressLine1).toBe('14 Ranelagh Road');
    expect((await recordOf(member, id)).at(-1)).toMatchObject({
      type: 'letting.details_changed',
      data: { step: 'address' },
    });
  });

  it('the steps change a letting only while it is in set-up', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    await expect(
      saveAnswers(member, lettingId, {
        step: 'rent',
        patch: { rentCents: 100_000 },
        advance: true,
      }),
    ).rejects.toThrow(/live now/);
    expect((await getLetting(member, lettingId))?.letting.monthlyRentCents).toBe(185_000);
  });

  it('UX-LT-8, Q31: a Daft or MyHome link is kept to match enquiries, and stays with the home', async () => {
    const member = await createTestMember();
    const daftUrl = 'https://www.daft.ie/for-rent/apartment-ranelagh-road/5551234';
    // What the first screen hands over says more than the links: only the links are kept.
    const { id } = await keepAdvertLinks(member, null, { daftUrl, alone: true } as never);
    expect((await loadHome(member, id))?.answers).toEqual({ daftUrl });
    expect((await recordOf(member, id)).at(-1)).toMatchObject({
      type: 'letting.advert_link_kept',
      data: { daft: true, myhome: false },
    });
    await saveAnswers(member, id, { step: 'address', patch: address, advance: true });
    await saveAnswers(member, id, { step: 'rent', patch: rent(), advance: true });
    await saveAnswers(member, id, { step: 'home', patch: home, advance: true });
    expect((await getLetting(member, id))?.letting.daftUrl).toBe(daftUrl);
  });

  it('row-level security: a home being added, and its photos, belong to one organisation', async () => {
    const member = await createTestMember();
    const other = await createTestMember();
    const { id } = await startDraft(member, { origin: 'manual' });
    await saveAnswers(member, id, { step: 'address', patch: address, advance: true });
    await addPhoto(member, id, aPng([36, 99, 168]));

    expect(await loadHome(other, id)).toBeNull();
    expect(await listDrafts(other)).toEqual([]);
    await expect(
      saveAnswers(other, id, { step: 'rent', patch: rent(), advance: true }),
    ).rejects.toThrow(/couldn’t find/);
    await expect(addPhoto(other, id, aPng([1, 2, 3]))).rejects.toThrow(/couldn’t find/);
    expect(
      await withOrg(other.organisationId, async (tx) => ({
        drafts: (await tx.select().from(lettingDrafts)).length,
        photos: (await tx.select().from(lettingPhotos)).length,
      })),
    ).toEqual({ drafts: 0, photos: 0 });
    // With no organisation set there is nothing to read, and nothing can be written across.
    expect(await db().select().from(lettingDrafts)).toEqual([]);
    expect(await db().select().from(lettingPhotos)).toEqual([]);
    expect(
      await databaseError(
        withOrg(other.organisationId, (tx) =>
          tx.insert(lettingDrafts).values({
            organisationId: member.organisationId,
            createdBy: other.userId,
          }),
        ),
      ),
    ).toMatch(/row-level security/);
  });
});

describe('UX-LT-4, UX-LT-5, UX-LT-16: a home that arrives filled in', () => {
  it('opens on the review, and "Looks right" shows only the steps still missing an answer', async () => {
    // What the advert reader (work package WP-10) or an enquiry hands over: what was found,
    // and nothing guessed (UX-LT-3).
    const member = await createTestMember();
    const { id } = await startDraft(member, {
      origin: 'enquiry',
      review: true,
      answers: {
        addressLine1: '12 Ranelagh Road',
        daftUrl: 'https://www.daft.ie/for-rent/apartment-ranelagh-road/5551234',
        ...rent(),
        ...home,
      },
    });
    expect(await loadHome(member, id)).toMatchObject({
      kind: 'draft',
      origin: 'enquiry',
      reached: 'review',
    });
    // A sheet on the review saves and stays there.
    await saveAnswers(member, id, {
      step: 'description',
      patch: { description: 'A bright apartment near the Luas.' },
      advance: false,
    });
    expect((await loadHome(member, id))?.reached).toBe('review');
    // The area and county weren't found: that is the one step asked for.
    expect(await confirmReview(member, id)).toEqual({ kind: 'draft', next: 'address' });
    // With the address answered it has what a letting needs; rent and the home are skipped,
    // and with no photo yet, photos come next.
    expect(
      await saveAnswers(member, id, { step: 'address', patch: address, advance: true }),
    ).toEqual({ kind: 'letting', next: 'photos' });
    expect((await getLetting(member, id))?.letting).toMatchObject({
      description: 'A bright apartment near the Luas.',
      daftUrl: 'https://www.daft.ie/for-rent/apartment-ranelagh-road/5551234',
      setupStep: 'photos',
    });
  });
});

describe('UX-LT-10: photos', () => {
  it('UX-LT-10: Gaff keeps its own copy, by its real type, without what a camera or editor wrote into it', async () => {
    const member = await createTestMember();
    const id = await aHomeAdded(member);
    const taken = aPng([36, 99, 168], { text: 'Taken at 53.3254 N, 6.2549 W' });
    expect(taken.toString('latin1')).toContain('53.3254');
    const added = await addPhoto(member, id, taken);
    if (!added.ok) throw new Error(added.problem);
    // M43: kept at its fixed sizes, as WebP, in a folder named by IDs alone.
    expect(added.photo.href).toMatch(
      new RegExp(`^/media/homes/${member.organisationId}/[0-9a-f-]{36}/480\\.webp$`),
    );
    const kept = await localPhotoStore.get(added.photo.href.replace('/media/', ''));
    expect(kept?.contentType).toBe('image/webp');
    expect(kept!.bytes.toString('latin1')).not.toContain('53.3254');
    expect(kept!.bytes.length).toBeLessThan(taken.length);

    expect(await addPhoto(member, id, Buffer.from('%PDF-1.7 not a photo'))).toEqual({
      ok: false,
      problem: 'not_a_photo',
    });
    expect(await addPhoto(member, id, Buffer.alloc(5 * 1024 * 1024, 1))).toEqual({
      ok: false,
      problem: 'too_big',
    });
    expect((await getLetting(member, id))?.photos).toEqual([added.photo]);
  });

  it('UX-LT-10: the first is the cover; they reorder by dragging and one place at a time; removing closes the gap', async () => {
    const member = await createTestMember();
    const id = await aHomeAdded(member);
    const ids: string[] = [];
    for (const colour of [
      [200, 0, 0],
      [0, 200, 0],
      [0, 0, 200],
    ] as const) {
      const added = await addPhoto(member, id, aPng(colour));
      if (!added.ok) throw new Error(added.problem);
      ids.push(added.photo.id);
    }
    const [a, b, c] = ids as [string, string, string];
    const order = async () => (await getLetting(member, id))!.photos.map((photo) => photo.id);
    const cover = async () => (await getLetting(member, id))!.photos[0]!.href;
    expect(await order()).toEqual([a, b, c]);
    expect(await coverPhotoHref(member, id)).toBe(await cover());

    await reorderPhotos(member, id, { order: [c, a, b] });
    expect(await order()).toEqual([c, a, b]);
    await reorderPhotos(member, id, { move: b, direction: 'earlier' });
    expect(await order()).toEqual([c, b, a]);
    // Reordering can't add, drop or double a photo.
    await expect(reorderPhotos(member, id, { order: [c, c, a] })).rejects.toThrow(
      /aren’t this home’s/,
    );

    const coverKey = (await cover()).replace('/media/', '');
    await removePhoto(member, id, c);
    expect(await order()).toEqual([b, a]);
    expect(await localPhotoStore.get(coverKey)).toBeNull();
    expect(await coverPhotoHref(member, id)).toBe(await cover());

    // Counts only in the record: never a file's name or where it's kept.
    const record = (await recordOf(member, id)).filter(
      (event) => event.type === 'letting.photos_changed',
    );
    expect(record.map((event) => event.data)).toEqual([
      { added: 1, removed: 0, reordered: false, count: 1 },
      { added: 1, removed: 0, reordered: false, count: 2 },
      { added: 1, removed: 0, reordered: false, count: 3 },
      { added: 0, removed: 0, reordered: true, count: 3 },
      { added: 0, removed: 0, reordered: true, count: 3 },
      { added: 0, removed: 1, reordered: false, count: 2 },
    ]);
  });

  it('UX-LT-10: a home takes up to 30 photos', async () => {
    const member = await createTestMember();
    const id = await aHomeAdded(member);
    const photo = aPng([10, 20, 30], { size: 400 });
    for (let n = 0; n < MAX_HOME_PHOTOS; n++) {
      expect((await addPhoto(member, id, photo)).ok).toBe(true);
    }
    expect(await addPhoto(member, id, photo)).toEqual({ ok: false, problem: 'full' });
  });

  it('UX-NV-9: a list of lettings reads every cover in one go, and a home with no photo has none', async () => {
    const member = await createTestMember();
    const other = await createTestMember();
    const withPhoto = await aHomeAdded(member);
    const without = await aHomeAdded(member);
    const added = await addPhoto(member, withPhoto, aPng([36, 99, 168]));
    if (!added.ok) throw new Error(added.problem);
    await addPhoto(member, withPhoto, aPng([200, 140, 60]));
    const covers = await withOrg(member.organisationId, (tx) =>
      coverPhotoHrefsIn(tx, [withPhoto, without]),
    );
    expect([...covers]).toEqual([[withPhoto, added.photo.href]]);
    expect(await coverPhotoHref(other, withPhoto)).toBeNull();
  });

  it('photos can be added to a draft, and stay with the home when it becomes a letting', async () => {
    const member = await createTestMember();
    const { id } = await startDraft(member, { origin: 'manual' });
    const added = await addPhoto(member, id, aPng([36, 99, 168]));
    if (!added.ok) throw new Error(added.problem);
    await saveAnswers(member, id, { step: 'address', patch: address, advance: true });
    await saveAnswers(member, id, { step: 'rent', patch: rent(), advance: true });
    // With a photo already there, the step after the home is the one after photos? No: someone
    // filling it in themselves sees every step, in order.
    expect(await saveAnswers(member, id, { step: 'home', patch: home, advance: true })).toEqual({
      kind: 'letting',
      next: 'photos',
    });
    expect((await getLetting(member, id))?.photos).toEqual([added.photo]);
  });
});

describe('UX-LT-11: letting details', () => {
  it('UX-MT-5: the house rule is kept apart from the criteria, with its own event, and ranks nobody', async () => {
    const member = await createTestMember();
    const id = await aHomeAdded(member);
    await setLettingDetails(member, id, {
      criteria: { maxOccupants: 3, noPets: true },
      noSmokingIndoors: true,
    });
    const { letting } = (await getLetting(member, id))!;
    expect(letting.criteria).toEqual({ maxOccupants: 3, noPets: true });
    expect(letting.noSmokingIndoors).toBe(true);
    expect(letting.criteriaSetAt).not.toBeNull();
    const record = await recordOf(member, id);
    expect(record.slice(-2).map((event) => [event.type, event.data])).toEqual([
      ['criteria.set', { maxOccupants: 3, noPets: true }],
      ['letting.house_rules_set', { noSmokingIndoors: true }],
    ]);
    // Ranking reads the criteria it is given, and they hold no house rule (rule 3).
    const people = [
      { id: 'a', enquiredAt: new Date('2026-11-01T10:00:00Z'), answers: null, answered: false },
      { id: 'b', enquiredAt: new Date('2026-11-01T11:00:00Z'), answers: null, answered: false },
    ];
    expect(rank(letting.criteria!, people)).toEqual(
      rank({ maxOccupants: 3, noPets: true }, people),
    );
    expect(Object.keys(letting.criteria!)).not.toContain('noSmokingIndoors');
  });

  it('rule 3: there is nowhere to keep free text about who should apply', async () => {
    const member = await createTestMember();
    const id = await aHomeAdded(member);
    await expect(
      setLettingDetails(member, id, {
        criteria: { noPets: false, idealTenant: 'a working couple' } as never,
        noSmokingIndoors: false,
      }),
    ).rejects.toThrow();
    expect((await getLetting(member, id))?.letting.criteria).toBeNull();
  });
});

describe('UX-LT-12 to UX-LT-15: the rent check, and going live', () => {
  it('UX-LT-14: a letting goes live with a finished rent check and nothing else', async () => {
    const member = await createTestMember();
    const id = await aHomeAdded(member);
    const before = await goLiveStepFor(member, (await getLetting(member, id))!);
    expect(before.needs).toEqual(['rent_check']);
    await expect(startTakingEnquiries(member, id)).rejects.toThrow(/rent check/);

    // UX-LT-12: the check is made against the rent the letting already has.
    await recordRentCheck(member, id, { lastLet: 'never' });
    const ready = await goLiveStepFor(member, (await getLetting(member, id))!);
    expect(ready.needs).toEqual([]);
    // No viewing times, letting details, photos, BER, comparable rents or phone number.
    expect(ready.onGaffNeeds).toEqual(['ber', 'photo']);
    expect(ready.asks).toEqual({ phone: 'offered' });
    expect(await startTakingEnquiries(member, id)).toBe('live');
    expect((await getLetting(member, id))?.letting).toMatchObject({
      stage: 'enquiries',
      status: 'live',
      setupStep: 'go_live',
    });
  });

  it('UX-LT-15: going live is a person’s decision, recorded as theirs', async () => {
    const member = await createTestMember();
    const id = await aHomeAdded(member);
    await recordRentCheck(member, id, { lastLet: 'never' });
    await startTakingEnquiries(member, id);
    const made = await withOrg(member.organisationId, (tx) =>
      tx.select().from(decisions).where(eq(decisions.lettingId, id)),
    );
    expect(made).toMatchObject([
      {
        kind: 'confirm_setup',
        decidedBy: member.userId,
        basis: { criteria: 0, rentCheck: 'market', viewingSlots: 0, photos: 0, onGaff: true },
      },
    ]);
    expect((await recordOf(member, id)).at(-1)).toMatchObject({
      type: 'letting.went_live',
      actorType: 'person',
      data: { decisionId: made[0]!.id },
    });
  });

  it('UX-LT-13: a rent above what the cap could ever allow holds the home until the rent is changed', async () => {
    const member = await createTestMember();
    const id = await aHomeAdded(member);
    await recordRentCheck(member, id, {
      lastLet: 'before_new_rules',
      substantialChange: false,
      previousRentCents: 170_000,
      previousRentSetOn: '2025-10-31',
    });
    const over = (await getLetting(member, id))!;
    expect(over.rentProblem?.ceilingCents).toBeLessThan(185_000);
    expect((await goLiveStepFor(member, over)).needs).toEqual(['rent_check']);
    await expect(startTakingEnquiries(member, id)).rejects.toThrow(/rent check/);

    await expect(changeAskingRent(member, id, 99)).rejects.toThrow(/between €100 and €20,000/);
    await changeAskingRent(member, id, 172_000);
    expect((await recordOf(member, id)).at(-1)).toMatchObject({
      type: 'letting.rent_changed',
      data: { fromCents: 185_000, toCents: 172_000 },
    });
    expect(await startTakingEnquiries(member, id)).toBe('live');
  });

  it('UX-LT-21, UX-LT-22: "On gaff.ie" is kept on the letting; being shown also needs a BER and a photo', async () => {
    const member = await createTestMember();
    const id = await aHomeAdded(member);
    await recordRentCheck(member, id, { lastLet: 'never' });
    await addPhoto(member, id, aPng([36, 99, 168]));
    // The BER is given on the go-live screen, with the decision.
    await startTakingEnquiries(member, id, { berRating: 'C1' });
    let detail = (await getLetting(member, id))!;
    expect(detail.letting).toMatchObject({ onGaff: true, berRating: 'C1' });
    expect(isShownOnGaff(detail)).toBe(true);

    await setOnGaff(member, id, false);
    detail = (await getLetting(member, id))!;
    expect(detail.letting.status).toBe('live');
    expect(isShownOnGaff(detail)).toBe(false);
    expect((await recordOf(member, id)).at(-1)).toMatchObject({
      type: 'letting.on_gaff_set',
      data: { on: false },
    });

    // Switched off at the go-live step: it goes live all the same.
    const quiet = await aHomeAdded(member, { berRating: 'B2' });
    await recordRentCheck(member, quiet, { lastLet: 'never' });
    expect(await startTakingEnquiries(member, quiet, { onGaff: false })).toBe('live');
    expect((await getLetting(member, quiet))?.letting.onGaff).toBe(false);
  });

  it('UX-TS-2: a private landlord can’t go live until they’ve confirmed it’s them, then is never asked again', async () => {
    const member = await createTestMember({
      kind: 'private_landlord',
      organisation: 'Mary',
      confirmed: false,
    });
    const id = await aHomeAdded(member);
    await recordRentCheck(member, id, { lastLet: 'never' });
    const step = await goLiveStepFor(member, (await getLetting(member, id))!);
    expect(step.gate).toEqual({ open: false, reason: 'identity_needed', waits: false });
    expect(step.needs).toEqual(['lister']);
    await expect(startTakingEnquiries(member, id)).rejects.toThrow(/confirm it’s you/);
    expect((await getLetting(member, id))?.letting.status).toBe('draft');

    // "Confirm it's you": the ID check, as one step of this go-live.
    const started = await startPersonCheck(
      member.userId,
      'go_live',
      `/lettings/${id}/setup/go-live`,
    );
    const checkId = /\/dev\/checks\/([0-9a-f-]{36})/.exec(
      'redirectUrl' in started ? started.redirectUrl : '',
    )![1]!;
    await recordProviderResult(checkId, {
      kind: 'identity',
      result: { verified: true, verifiedName: 'Mary Byrne' },
    });
    const ready = await goLiveStepFor(member, (await getLetting(member, id))!);
    expect(ready.gate).toEqual({ open: true });
    expect(ready.asks).toEqual({ phone: 'offered' });
    expect(await startTakingEnquiries(member, id)).toBe('live');
    // Each is asked once, at the first go-live: not at the second home.
    const second = await aHomeAdded(member);
    await recordRentCheck(member, second, { lastLet: 'never' });
    const next = await goLiveStepFor(member, (await getLetting(member, second))!);
    expect(next.gate).toEqual({ open: true });
    expect(next.asks).toEqual({ phone: null });
    expect(await startPersonCheck(member.userId, 'go_live', '/lettings')).toEqual({
      problem: 'done',
    });
  });

  it('UX-AG-4: every go-live goes through the gate: an agency being confirmed is held, with the decision kept', async () => {
    const member = await createTestMember({ confirmed: false });
    const id = await aHomeAdded(member);
    await recordRentCheck(member, id, { lastLet: 'never' });
    expect(await startTakingEnquiries(member, id, { phone: '01 234 5678' })).toBe('held');
    const { letting } = (await getLetting(member, id))!;
    expect(letting).toMatchObject({ stage: 'setup', status: 'draft' });
    expect(letting.goLiveHeldAt).not.toBeNull();
    expect(letting.goLiveDecisionId).not.toBeNull();
  });
});

describe('Q43: a number renters can call', () => {
  it('Q43: given at go-live, it is kept on the organisation, where renters’ pages read it', async () => {
    const member = await createTestMember();
    const id = await aHomeAdded(member);
    await recordRentCheck(member, id, { lastLet: 'never' });
    await startTakingEnquiries(member, id, { phone: ' 01  234 5678 ' });
    const [organisation] = await db()
      .select(listerColumns)
      .from(organisations)
      .where(eq(organisations.id, member.organisationId));
    expect(listerFrom(organisation!).phone).toBe('01 234 5678');
    // Asked once: with a number on file, the next go-live doesn't offer the field.
    const next = await aHomeAdded(member);
    await recordRentCheck(member, next, { lastLet: 'never' });
    expect((await goLiveStepFor(member, (await getLetting(member, next))!)).asks.phone).toBeNull();
  });

  it('rule 8: the record says a number was given or removed, and never the number', async () => {
    const member = await createTestMember();
    await setListerPhone(member, '087 123 4567');
    await setListerPhone(member, '087 123 4567');
    await setListerPhone(member, null);
    await expect(setListerPhone(member, 'call me')).rejects.toThrow(/Enter a phone number/);
    const record = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ type: events.type, data: events.data })
        .from(events)
        .where(eq(events.type, 'organisation.phone_set'))
        .orderBy(asc(events.id)),
    );
    expect(record.map((event) => event.data)).toEqual([{ given: true }, { given: false }]);
    expect(JSON.stringify(record)).not.toMatch(/087|4567/);
  });
});

describe('"Is it advertised anywhere else?"', () => {
  it('the answer is kept on the letting; a home on a portal needs its enquiries forwarded until one arrives', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    expect((await getLetting(member, lettingId))?.letting.advertisedOn).toBeNull();
    await setAdvertisedOn(member, lettingId, ['myhome', 'daft', 'elsewhere' as never]);
    const { letting } = (await getLetting(member, lettingId))!;
    expect(letting.advertisedOn).toEqual(['daft', 'myhome']);
    expect((await recordOf(member, lettingId)).at(-1)).toMatchObject({
      type: 'letting.advertised_set',
      data: { daft: true, myhome: true },
    });
    expect(needsForwarding({ advertisedOn: letting.advertisedOn, forwardingInPlace: false })).toBe(
      true,
    );
    await setAdvertisedOn(member, lettingId, []);
    const no = (await getLetting(member, lettingId))!.letting.advertisedOn;
    expect(no).toEqual([]);
    expect(needsForwarding({ advertisedOn: no, forwardingInPlace: false })).toBe(false);
  });
});

describe('UX-LT-23: let it again', () => {
  async function aClosedLetting(member: Member) {
    const { lettingId } = await aLiveLetting(member);
    const added = await addPhoto(member, lettingId, aPng([36, 99, 168]));
    if (!added.ok) throw new Error(added.problem);
    await setLettingDetails(member, lettingId, {
      criteria: { moveInBy: daysFromToday(40), maxOccupants: 3, noPets: true },
      noSmokingIndoors: true,
    });
    await deliverEmail(member, daftEnquiry);
    await closeLetting(member, lettingId, 'withdrawn');
    return { lettingId, photo: added.photo };
  }

  it('UX-LT-23: a new home starts on the review with everything about the home from last time, and its own photos', async () => {
    const member = await createTestMember();
    const { lettingId, photo } = await aClosedLetting(member);
    const { id } = await letAgain(member, lettingId);
    expect(id).not.toBe(lettingId);
    const again = (await loadHome(member, id))!;
    expect(again).toMatchObject({
      kind: 'draft',
      origin: 'again',
      reached: 'review',
      previousLettingId: lettingId,
    });
    expect(again.answers).toMatchObject({
      addressLine1: '12 Ranelagh Road',
      rentCents: 185_000,
      propertyType: 'apartment',
      bedrooms: 2,
      berRating: 'C1',
      otherFacts: ['Gas central heating', 'Bins collected on Tuesdays'],
      // The fixed criteria, without last time's move-in date.
      criteria: { maxOccupants: 3, noPets: true },
      noSmokingIndoors: true,
    });
    // New each time: the date, and the advert links.
    expect(again.answers).not.toHaveProperty('availableFrom');
    expect(again.answers).not.toHaveProperty('daftUrl');
    // Its own copy of each photo: removing one never touches the letting before.
    expect(again.photos).toHaveLength(1);
    expect(again.photos[0]!.href).not.toBe(photo.href);
    await removePhoto(member, id, again.photos[0]!.id);
    expect(await localPhotoStore.get(photo.href.replace('/media/', ''))).not.toBeNull();
    expect((await getLetting(member, lettingId))?.photos).toEqual([photo]);

    // Pressed again before it's finished: the same home, not a second one.
    expect(await letAgain(member, lettingId)).toEqual({ id });
    expect(await recordOf(member, id)).toMatchObject([
      { type: 'letting.draft_started', data: { origin: 'again', fromLettingId: lettingId } },
      { type: 'letting.photos_changed' },
    ]);
  });

  it('UX-LT-23: nothing about anyone who enquired is carried over, and the letting before is as it was', async () => {
    const member = await createTestMember();
    const { lettingId } = await aClosedLetting(member);
    const before = await getLetting(member, lettingId);
    const { id } = await letAgain(member, lettingId);
    const draft = await withOrg(member.organisationId, (tx) =>
      tx.select().from(lettingDrafts).where(eq(lettingDrafts.id, id)),
    );
    expect(JSON.stringify(draft)).not.toMatch(/Aoife|aoife\.byrne|087 123/);
    expect(
      await withOrg(member.organisationId, (tx) =>
        tx.select().from(applications).where(eq(applications.lettingId, id)),
      ),
    ).toEqual([]);
    expect(await getLetting(member, lettingId)).toEqual(before);
  });

  it('UX-LT-4, UX-LT-5: the review is changed in place; "Looks right" goes to the first step still unanswered', async () => {
    const member = await createTestMember();
    const { lettingId } = await aClosedLetting(member);
    const { id } = await letAgain(member, lettingId);
    // The date is missing, so "Looks right" goes to the rent and date, and it stays a draft.
    expect(await confirmReview(member, id)).toEqual({ kind: 'draft', next: 'rent' });
    expect((await loadHome(member, id))?.reached).toBe('rent');

    // Another one, with the date given on the review: every core step is answered, the photo
    // came across, so it becomes a letting and goes straight to letting details.
    const other = await aClosedLetting(member);
    const second = await letAgain(member, other.lettingId);
    expect(
      await saveAnswers(member, second.id, {
        step: 'rent',
        patch: { rentCents: 195_000, availableFrom: daysFromToday(45) },
        advance: false,
      }),
    ).toMatchObject({ kind: 'draft' });
    expect((await loadHome(member, second.id))?.reached).toBe('review');
    expect(await confirmReview(member, second.id)).toEqual({ kind: 'letting', next: 'details' });
    const made = (await getLetting(member, second.id))!;
    expect(made.letting).toMatchObject({
      previousLettingId: other.lettingId,
      monthlyRentCents: 195_000,
      stage: 'setup',
      // Carried in for the person to confirm at that step: not yet "set".
      criteria: { maxOccupants: 3, noPets: true },
      criteriaSetAt: null,
      noSmokingIndoors: true,
    });
    expect(made.photos).toHaveLength(1);
    expect((await recordOf(member, second.id)).at(-1)).toMatchObject({
      type: 'letting.created',
      data: { origin: 'again', fromLettingId: other.lettingId },
    });
    // It wasn't let last time (it was withdrawn), so the rent check has nothing to start from.
    expect(await rentAnswersFromLettingBefore(member, other.lettingId)).toBeNull();
  });

  it('UX-LT-23: only a closed letting can be let again', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    await expect(letAgain(member, lettingId)).rejects.toThrow(/once its letting is closed/);
    const other = await createTestMember();
    await expect(letAgain(other, lettingId)).rejects.toThrow(/couldn’t find/);
  });
});

describe('UX-LT-24: send a test enquiry', () => {
  it('UX-LT-24: it shows the first reply a renter gets, in the fixed words, and sends nothing to anyone', async () => {
    const member = await createTestMember({ organisation: 'Halcyon Lettings Test' });
    const { lettingId } = await aLiveLetting(member);
    const reply = await sendTestEnquiry(member, lettingId);
    expect(reply.subject).toBe('Your enquiry about 12 Ranelagh Road');
    // Rule 6: the first message says it is from an AI assistant.
    expect(reply.body).toMatch(/AI assistant/);
    expect(reply.body).toMatch(/^Hello Sam,/);
    expect(reply.asksQuestions).toBe(true);
    const made = await withOrg(member.organisationId, async (tx) => ({
      applications: (await tx.select().from(applications)).length,
      messages: (await tx.select().from(messages)).length,
    }));
    expect(made).toEqual({ applications: 0, messages: 0 });
    expect((await recordOf(member, lettingId)).at(-1)).toMatchObject({
      type: 'letting.test_enquiry_sent',
      data: {},
    });
  });

  it('UX-LT-24: it is there for a live letting until its first real enquiry arrives', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    await expect(sendTestEnquiry(member, lettingId)).rejects.toThrow(/once the home is live/);
    await recordRentCheck(member, lettingId, { lastLet: 'never' });
    await startTakingEnquiries(member, lettingId);
    await sendTestEnquiry(member, lettingId);
    await deliverEmail(member, daftEnquiry);
    await expect(sendTestEnquiry(member, lettingId)).rejects.toThrow(/Real enquiries have arrived/);
    const other = await createTestMember();
    await expect(sendTestEnquiry(other, lettingId)).rejects.toThrow(/couldn’t find/);
  });
});

describe('R27: adding a letting, in the timeline', () => {
  it('R27: every step reads in plain words, and never as an event’s code', async () => {
    const member = await createTestMember({ name: 'Ann Power' });
    const { id } = await keepAdvertLinks(member, null, {
      daftUrl: 'https://www.daft.ie/for-rent/apartment-ranelagh-road/5551234',
    });
    await saveAnswers(member, id, { step: 'address', patch: address, advance: true });
    await saveAnswers(member, id, { step: 'rent', patch: rent(), advance: true });
    await saveAnswers(member, id, { step: 'home', patch: home, advance: true });
    const photo = await addPhoto(member, id, aPng([36, 99, 168]));
    await addPhoto(member, id, aPng([200, 140, 60]));
    if (!photo.ok) throw new Error(photo.problem);
    await reorderPhotos(member, id, { move: photo.photo.id, direction: 'later' });
    await removePhoto(member, id, photo.photo.id);
    await saveAnswers(member, id, { step: 'home', patch: { berRating: 'C1' }, advance: true });
    await setLettingDetails(member, id, { criteria: { noPets: true }, noSmokingIndoors: true });
    await recordRentCheck(member, id, { lastLet: 'never' });
    await startTakingEnquiries(member, id, { onGaff: false });
    await setAdvertisedOn(member, id, ['daft']);
    await sendTestEnquiry(member, id);
    const entries = await timelineFor(member, id);
    expect(entries.map((entry) => [entry.what, entry.detail])).toEqual([
      ['Started adding the home', undefined],
      ['Advert link kept, to match enquiries to this home', 'Daft'],
      ['Address saved', undefined],
      ['Rent and date saved', undefined],
      ['The home’s details saved', undefined],
      ['Letting added', undefined],
      ['Photo added', '1 photo now'],
      ['Photo added', '2 photos now'],
      ['Photos put in a new order', '2 photos now'],
      ['Photo removed', '1 photo now'],
      ['The home’s details changed', undefined],
      ['Criteria set', 'No pets (assistance dogs always welcome)'],
      ['House rule set', 'No smoking indoors'],
      ['Rent check: market rent can be set', undefined],
      ['Set not to show on gaff.ie', undefined],
      ['Set-up confirmed: Gaff started answering enquiries', undefined],
      ['Said where else it’s advertised', 'Daft'],
      ['Test enquiry tried', 'Nothing was sent to anyone'],
    ]);
    expect(entries.every((entry) => entry.who === 'Ann Power')).toBe(true);
    expect(JSON.stringify(entries)).not.toMatch(/Ranelagh|daft\.ie/);
  });
});
