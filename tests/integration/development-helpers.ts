import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { withOrg } from '@/db/client';
import { lettings } from '@/db/schema';
import { findMember } from '@/server/auth/member';
import { acceptInvites } from '@/server/accounts/invites';
import {
  addUnitType,
  changeDevelopment,
  changeUnitType,
  createDevelopment,
  makeHomesOfType,
  recordTypeRentCheck,
  setTypeDetails,
} from '@/server/developments/developments';
import { createLetting } from '@/server/lettings/create-letting';
import { startTakingEnquiries } from '@/server/lettings/go-live';
import { addPhoto } from '@/server/lettings/photos';
import { recordRentCheck } from '@/server/lettings/rent-check';
import { setCriteria } from '@/server/lettings/set-criteria';
import { inviteColleagues } from '@/server/team/team';
import { aLetting, daysFromToday } from '../fixtures/lettings';
import { aPng } from '../fixtures/photos';
import { createTestPerson, type Member } from './helpers';

/**
 * BA-15: a development as a lister sets one up: "The Waterside", Waterside Road, Sandyford, with
 * its pin, parking and one shared photo, and one type ("Type B", 2-bed apartments at €2,650)
 * with one photo of its own and `homes` homes made (Apartment 11 upwards, one a floor).
 */
export async function aDevelopment(
  member: Member,
  options: { homes: number; name?: string },
): Promise<{ developmentId: string; typeId: string; lettingIds: string[] }> {
  const { id: developmentId } = await createDevelopment(member, {
    name: options.name ?? 'The Waterside',
  });
  await changeDevelopment(member, developmentId, 'address', {
    addressLine1: 'Waterside Road',
    area: 'Sandyford, Dublin 18',
    county: 'Dublin',
    latitude: 53.2755,
    longitude: -6.2175,
    pointSource: 'letter',
    pointSetAt: new Date(),
  });
  await changeDevelopment(member, developmentId, 'facts', {
    parking: 'space',
    description: 'A new scheme beside the Luas, with a roof terrace and bike storage.',
  });
  const shared = await addPhoto(member, developmentId, aPng([40, 90, 160]));
  if (!shared.ok) throw new Error(shared.problem);
  const { id: typeId } = await addUnitType(member, developmentId, {
    name: 'Type B',
    propertyType: 'apartment',
    bedrooms: 2,
    bathrooms: 2,
    furnished: 'furnished',
    berRating: 'A2',
    floorAreaSqm: 68,
  });
  const own = await addPhoto(member, typeId, aPng([180, 120, 60]));
  if (!own.ok) throw new Error(own.problem);
  await changeUnitType(member, typeId, 'rent', {
    rentCents: 265_000,
    count: Math.max(options.homes, 1),
  });
  if (options.homes === 0) return { developmentId, typeId, lettingIds: [] };
  const { lettingIds } = await makeHomesOfType(
    member,
    typeId,
    Array.from({ length: options.homes }, (_, i) => ({
      unitLabel: `Apartment ${11 + i}`,
      floor: 1 + i,
      availableFrom: daysFromToday(20 + i),
    })),
  );
  return { developmentId, typeId, lettingIds };
}

/** The type's homes, with letting details and a rent check, ready for "Put them live". */
export async function readyToGoLive(
  member: Member,
  typeId: string,
  options: { skipRentCheckFor?: string } = {},
): Promise<void> {
  await setTypeDetails(member, typeId, {
    criteria: { maxOccupants: 3, noPets: false },
    noSmokingIndoors: false,
  });
  if (!options.skipRentCheckFor) {
    await recordTypeRentCheck(member, typeId, { lastLet: 'never' });
    return;
  }
  const homes = await withOrg(member.organisationId, (tx) =>
    tx.select({ id: lettings.id }).from(lettings).where(eq(lettings.unitTypeId, typeId)),
  );
  for (const home of homes) {
    if (home.id !== options.skipRentCheckFor) {
      await recordRentCheck(member, home.id, { lastLet: 'never' });
    }
  }
}

/** A live home of the same lister, on its own, public on gaff.ie (a BER and a photo). */
export async function aLiveHomeOnItsOwn(member: Member, n: number): Promise<string> {
  const facts = aLetting({ addressLine1: `${n + 1} Solo Street`, description: '' });
  const { lettingId } = await createLetting(member, facts);
  await setCriteria(member, lettingId, { maxOccupants: 3, noPets: true });
  await recordRentCheck(member, lettingId, { lastLet: 'never' }, facts.rent);
  const photo = await addPhoto(member, lettingId, aPng([20 + n * 30, 60, 200 - n * 20]));
  if (!photo.ok) throw new Error(photo.problem);
  await startTakingEnquiries(member, lettingId);
  return lettingId;
}

/** A negotiator on the admin's team. */
export async function aColleague(admin: Member, name: string): Promise<Member> {
  const person = await createTestPerson({ name });
  const result = await inviteColleagues(admin, { emails: person.email, role: 'negotiator' });
  expect(result).toMatchObject({ ok: true, invited: 1 });
  expect(await acceptInvites(person)).toEqual([admin.organisationId]);
  return (await findMember(person.id, admin.organisationId))!;
}
