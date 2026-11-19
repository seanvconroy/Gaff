import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import { events, lettingDrafts, lettings } from '@/db/schema';
import { distanceToLineMetres } from '@/domain/places/geo';
import { fixtureGazetteer } from '@/domain/places/fixture';
import { closeLetting } from '@/server/lettings/close';
import { createLetting } from '@/server/lettings/create-letting';
import { saveAnswers, startDraft } from '@/server/lettings/drafts';
import { describePin, pinFor, setHomePoint } from '@/server/lettings/location';
import { aLetting, daysFromToday } from '../fixtures/lettings';
import { aLiveLetting, createTestMember, databaseError } from './helpers';

/** BA-5: where a home is (M38, M125, M126), placed by its lister on Gaff's own place index. */

const onHighfieldRoad = { lat: 53.3157, lng: -6.2672 };
const kinsale = fixtureGazetteer().bySlug('kinsale')!.centre;

async function pointEvents(organisationId: string, lettingId: string) {
  return withOrg(organisationId, (tx) =>
    tx
      .select({ type: events.type, data: events.data })
      .from(events)
      .where(eq(events.lettingId, lettingId))
      .orderBy(asc(events.id)),
  ).then((rows) => rows.filter((row) => row.type === 'letting.point_set'));
}

async function aDraftOnHighfieldRoad(member: Awaited<ReturnType<typeof createTestMember>>) {
  const { id } = await startDraft(member, { origin: 'manual' });
  await saveAnswers(member, id, {
    step: 'address',
    patch: { addressLine1: '7 Highfield Rd', area: 'Rathgar, Dublin 6', county: 'Dublin' },
    advance: true,
  });
  return id;
}

describe('M38: the lister places the home’s pin as they add it', () => {
  it('M38: starts on the street in the address, from Gaff’s own place index', async () => {
    const member = await createTestMember();
    const id = await aDraftOnHighfieldRoad(member);
    const pin = (await pinFor(member, id, { streets: true }))!;
    expect(pin).toMatchObject({ placed: false, from: 'street', streetName: 'Highfield Road' });
    const street = fixtureGazetteer().bySlug('highfield-road-rathgar-dublin-6')!;
    expect(distanceToLineMetres(pin.point, street.line!)).toBeLessThan(1);
    expect(pin.where).toBe('The pin is on Highfield Road, in Rathgar.');
    // The stand-in map draws the streets around it.
    expect(pin.streets.map((s) => s.name)).toContain('Highfield Road');
    // An agency's homes are shown at their pin.
    expect(pin.approximate).toBe(false);
  });

  it('M38: starts in the middle of the area when the street isn’t in the index', async () => {
    const member = await createTestMember();
    const { id } = await startDraft(member, { origin: 'manual' });
    await saveAnswers(member, id, {
      step: 'address',
      patch: { addressLine1: '4 Beechfield Terrace', area: 'Kinsale', county: 'Cork' },
      advance: true,
    });
    const pin = (await pinFor(member, id))!;
    expect(pin).toMatchObject({ placed: false, from: 'area', point: kinsale });
  });

  it('M38: keeps the pin with the draft, and on the letting it becomes', async () => {
    const member = await createTestMember();
    const id = await aDraftOnHighfieldRoad(member);
    const saved = await setHomePoint(member, id, onHighfieldRoad);
    expect(saved).toMatchObject({ ok: true, pin: { placed: true, check: 'inside' } });
    const [draft] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(lettingDrafts).where(eq(lettingDrafts.id, id)),
    );
    expect(draft!.answers.point).toEqual(onHighfieldRoad);

    await saveAnswers(member, id, {
      step: 'rent',
      patch: { rentCents: 185_000, availableFrom: daysFromToday(30) },
      advance: true,
    });
    await saveAnswers(member, id, {
      step: 'home',
      patch: { propertyType: 'apartment', bedrooms: 2 },
      advance: true,
    });
    const [letting] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(lettings).where(eq(lettings.id, id)),
    );
    expect(letting).toMatchObject({
      latitude: onHighfieldRoad.lat,
      longitude: onHighfieldRoad.lng,
      pointSource: 'letter',
    });
    expect(letting!.pointSetAt).toBeInstanceOf(Date);
  });

  it('M126, rule 8: asks about a pin outside the address’s area, keeps it, and logs no point', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    const away = await describePin(member, lettingId, kinsale);
    expect(away).toMatchObject({ check: 'outside', pinPlace: 'Kinsale' });
    const saved = await setHomePoint(member, lettingId, kinsale);
    expect(saved).toMatchObject({ ok: true, pin: { check: 'outside', pinPlace: 'Kinsale' } });
    const [letting] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(lettings).where(eq(lettings.id, lettingId)),
    );
    expect({ lat: letting!.latitude, lng: letting!.longitude }).toEqual(kinsale);
    const recorded = await pointEvents(member.organisationId, lettingId);
    expect(recorded).toEqual([
      { type: 'letting.point_set', data: { check: 'outside', draft: false } },
    ]);
    expect(JSON.stringify(recorded)).not.toMatch(/5[1-5]\.\d|-[6-9]\.\d/);
  });

  it('M38: refuses a point outside Ireland, or one that isn’t a point', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    for (const input of [{ lat: 48.85, lng: 2.35 }, { lat: 'x', lng: 1 }, null, {}]) {
      expect(await setHomePoint(member, lettingId, input)).toMatchObject({ ok: false });
    }
    expect(await pointEvents(member.organisationId, lettingId)).toEqual([]);
  });

  it('M38: a closed letting’s pin stays where it was', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    await closeLetting(member, lettingId, 'withdrawn');
    expect(await setHomePoint(member, lettingId, onHighfieldRoad)).toMatchObject({ ok: false });
  });

  it('row-level security: another organisation can’t read or move the pin', async () => {
    const member = await createTestMember();
    const other = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    expect(await pinFor(other, lettingId)).toBeNull();
    await expect(setHomePoint(other, lettingId, onHighfieldRoad)).rejects.toThrow();
  });

  it('M38: a private landlord is told renters see the home within about 150 metres', async () => {
    const landlord = await createTestMember({ kind: 'private_landlord' });
    const { lettingId } = await createLetting(landlord, aLetting());
    expect((await pinFor(landlord, lettingId))!.approximate).toBe(true);
  });

  it('M125: the database holds a point whole, in Ireland, or not at all', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    const set = (values: Partial<typeof lettings.$inferInsert>) =>
      withOrg(member.organisationId, (tx) =>
        tx.update(lettings).set(values).where(eq(lettings.id, lettingId)),
      );
    expect(await databaseError(set({ latitude: 53.3 }))).toMatch(/lettings_point_whole/);
    const paris = set({ latitude: 48.85, longitude: 2.35, pointSource: 'letter' });
    expect(await databaseError(paris)).toMatch(/lettings_point_in_ireland/);
  });
});
