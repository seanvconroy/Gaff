import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg } from '@/db/client';
import { events, lettings, organisations } from '@/db/schema';
import { isPublicRef } from '@/domain/homes/home-page';
import { endLetHomePages } from '@/server/homes/let-pages';
import {
  homeCardOf,
  publicHomePage,
  publicHomes,
  resolvePublicHome,
} from '@/server/homes/public-homes';
import { reportListing } from '@/server/homes/report';
import { closeLetting } from '@/server/lettings/close';
import { setOnGaff } from '@/server/lettings/go-live';
import { addPhoto } from '@/server/lettings/photos';
import { aPng } from '../fixtures/photos';
import { aLiveLetting, aRenterEnquires, createTestMember, type Member } from './helpers';

async function refOf(member: Member, lettingId: string): Promise<string> {
  const [row] = await withOrg(member.organisationId, (tx) =>
    tx.select({ ref: lettings.publicRef }).from(lettings).where(eq(lettings.id, lettingId)),
  );
  return row!.ref;
}

/** A live home with two photos, on gaff.ie: what a public page is made from. */
async function aHomeOnGaff(member: Member, overrides: Partial<Record<string, string>> = {}) {
  const { lettingId } = await aLiveLetting(member, overrides);
  await addPhoto(member, lettingId, aPng([36, 99, 168]));
  await addPhoto(member, lettingId, aPng([201, 140, 60]));
  return { lettingId, ref: await refOf(member, lettingId) };
}

describe('UX-LS-11: a home’s public reference', () => {
  it('UX-LS-11: every letting gets its own random reference, which isn’t its ID', async () => {
    const member = await createTestMember();
    const one = await aLiveLetting(member);
    const two = await aLiveLetting(member);
    const [a, b] = [await refOf(member, one.lettingId), await refOf(member, two.lettingId)];
    expect(isPublicRef(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(one.lettingId.replace(/-/g, '')).not.toContain(a);
  });
});

describe('UX-LT-21, UX-LS-1: the one public query for homes on Gaff', () => {
  it('UX-LS-1: a live home on gaff.ie, with a BER and a photo, has a page made from the letting', async () => {
    const member = await createTestMember({ organisation: `Halcyon Homes ${Date.now()}` });
    const { ref } = await aHomeOnGaff(member, {
      description: 'A bright apartment on the first floor.',
    });
    const page = await publicHomePage(ref);
    expect(page?.state).toBe('live');
    if (page?.state !== 'live') return;
    expect(page.home.ref).toBe(ref);
    expect(page.home.href).toBe(`/homes/${ref}`);
    expect(page.home.home).toMatchObject({
      addressLine1: '12 Ranelagh Road',
      area: 'Ranelagh, Dublin 6',
      monthlyRentCents: 185_000,
      berRating: 'C1',
      description: 'A bright apartment on the first floor.',
      criteria: { maxOccupants: 3, noPets: true },
      facts: ['Gas central heating', 'Bins collected on Tuesdays'],
    });
    expect(page.home.photos).toHaveLength(2);
    expect(page.home.photos[0]!.src).toMatch(/^\/media\/homes\//);
    // UX-LS-7, UX-AG-7: a confirmed agency, by name, with its licence.
    expect(page.home.lister).toEqual({
      kind: 'agency',
      name: member.organisationName,
      licence: '001234',
    });

    const card = homeCardOf(page.home);
    expect(card).toMatchObject({
      href: `/homes/${ref}`,
      title: '12 Ranelagh Road',
      line: '€1,850 a month · 2-bed apartment · Furnished · Ranelagh, Dublin 6',
      photo: { src: page.home.photos[0]!.src, alt: '' },
    });
    expect((await publicHomes({ ref })).map((home) => home.ref)).toEqual([ref]);
    expect((await publicHomes()).some((home) => home.ref === ref)).toBe(true);
  });

  it('rule 3, UX-LS-11: the page holds nothing about any renter, any owner, or who has enquired', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    await aRenterEnquires(member, 1);
    await aRenterEnquires(member, 2);
    const [home] = await publicHomes({ ref });
    const text = JSON.stringify(home);
    // The owner the letting was added with (tests/fixtures/lettings.ts), and the renters.
    expect(text).not.toMatch(/Mary Byrne|mary\.byrne@example\.ie/);
    expect(text).not.toMatch(/Renter \d|renter\d\.|@example\.ie|087 /);
    // No internal IDs, and no counts of interest (UX-LS-9).
    // A photo's key is two random IDs (UX-LT-10), which name no home and no person.
    expect(text).not.toContain(lettingId);
    expect(JSON.stringify({ ...home, photos: [] })).not.toContain(member.organisationId);
    expect(text).not.toMatch(/enquir|applic|viewing|eircode|D06 F2X3/i);
    expect(Object.keys(home!).sort()).toEqual(
      ['home', 'href', 'lister', 'liveAt', 'phone', 'photos', 'ref'].sort(),
    );
  });

  it('UX-LT-21: switching "On gaff.ie" off removes the page and the card at once, and on brings them back', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    await setOnGaff(member, lettingId, false);
    expect(await publicHomePage(ref)).toBeNull();
    expect(await publicHomes({ ref })).toEqual([]);
    expect(await resolvePublicHome(ref)).toBeNull();
    await setOnGaff(member, lettingId, true);
    expect((await publicHomePage(ref))?.state).toBe('live');
  });

  it('UX-LT-22: a live home with no photo, or no BER, has no page', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    const ref = await refOf(member, lettingId);
    expect(await publicHomePage(ref)).toBeNull();
    const noBer = await aLiveLetting(member, { berRating: '' });
    await addPhoto(member, noBer.lettingId, aPng([10, 20, 30]));
    expect(await publicHomePage(await refOf(member, noBer.lettingId))).toBeNull();
  });

  it('UX-TS-1: an agency’s home has no page while the agency can’t have it live', async () => {
    const member = await createTestMember();
    const { ref } = await aHomeOnGaff(member);
    await db()
      .update(organisations)
      .set({ licenceLapsedAt: new Date() })
      .where(eq(organisations.id, member.organisationId));
    expect(await publicHomePage(ref)).toBeNull();
    expect(await publicHomes({ ref })).toEqual([]);
  });

  it('UX-TS-4: a home Gaff’s team hid has no page (the seam WP-26 sets)', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    await withOrg(member.organisationId, (tx) =>
      tx.update(lettings).set({ hiddenAt: new Date() }).where(eq(lettings.id, lettingId)),
    );
    expect(await publicHomePage(ref)).toBeNull();
  });

  it('UX-LS-7: a private landlord is shown by first name only, and "Call" by their own number', async () => {
    const member = await createTestMember({ kind: 'private_landlord', organisation: 'Mary Byrne' });
    await db()
      .update(organisations)
      .set({ phone: '087 765 4321' })
      .where(eq(organisations.id, member.organisationId));
    const { ref } = await aHomeOnGaff(member);
    const [home] = await publicHomes({ ref });
    expect(home!.lister).toEqual({ kind: 'landlord', name: 'Mary' });
    expect(home!.phone).toBe('087 765 4321');
    expect(JSON.stringify(home)).not.toContain('Byrne');
  });

  it('UX-LS-3: no number given, no "Call"', async () => {
    const member = await createTestMember({ kind: 'private_landlord', organisation: 'Sean' });
    const { ref } = await aHomeOnGaff(member);
    expect((await publicHomes({ ref }))[0]!.phone).toBeNull();
  });

  it('a reference that isn’t one finds nothing', async () => {
    expect(await publicHomePage('not-a-ref')).toBeNull();
    expect(await publicHomePage('000000000000')).toBeNull();
    expect(await publicHomes({ ref: "'; drop table lettings; --" })).toEqual([]);
  });
});

describe('UX-LS-10: a let home', () => {
  it('UX-LS-10: says it has been let and leaves search at once', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    await closeLetting(member, lettingId, 'let');
    expect(await publicHomePage(ref)).toEqual({
      state: 'let',
      title: '12 Ranelagh Road, Ranelagh, Dublin 6',
      place: 'Ranelagh',
    });
    expect(await publicHomes({ ref })).toEqual([]);
  });

  it('UX-LS-10: a withdrawn home has no page', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    await closeLetting(member, lettingId, 'withdrawn');
    expect(await publicHomePage(ref)).toBeNull();
  });

  it('UX-LS-10 (rule 9): the scheduled job removes a let home’s page 30 days after it was let, and logs it', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    await closeLetting(member, lettingId, 'let');
    const [letting] = await withOrg(member.organisationId, (tx) =>
      tx.select({ letAt: lettings.letAt }).from(lettings).where(eq(lettings.id, lettingId)),
    );
    expect(letting!.letAt).toBeInstanceOf(Date);
    const letAt = letting!.letAt!;

    const early = new Date(letAt.getTime() + 29 * 86_400_000);
    expect(await endLetHomePages(early, member.organisationId)).toEqual({ removed: 0 });
    expect((await publicHomePage(ref))?.state).toBe('let');

    const due = new Date(letAt.getTime() + 30 * 86_400_000);
    expect(await endLetHomePages(due, member.organisationId)).toEqual({ removed: 1 });
    expect(await publicHomePage(ref)).toBeNull();
    // Once only.
    expect(await endLetHomePages(due, member.organisationId)).toEqual({ removed: 0 });

    const logged = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ data: events.data, actorType: events.actorType })
        .from(events)
        .where(and(eq(events.lettingId, lettingId), eq(events.type, 'letting.gaff_page_removed'))),
    );
    expect(logged).toEqual([{ data: { daysAfterLet: 30 }, actorType: 'system' }]);
  });
});

describe('UX-TS-3: reporting a listing', () => {
  it('UX-TS-3: a live home’s listing can be reported; one with no page can’t (WP-26 keeps reports)', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    expect(await reportListing(ref, { reason: 'scam', note: undefined })).toBe(true);
    await setOnGaff(member, lettingId, false);
    expect(await reportListing(ref, { reason: 'scam', note: undefined })).toBe(false);
  });
});
