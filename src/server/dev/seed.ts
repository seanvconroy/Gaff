import { and, desc, eq, gt, inArray, isNotNull } from 'drizzle-orm';
import { objectStorage } from '@/adapters/storage';
import { db, withOrg, withRenter } from '@/db/client';
import {
  homes,
  letterChecks,
  lettings,
  listings,
  media,
  phoneConfirmations,
  staffMembers,
  users,
  viewingSessions,
} from '@/db/schema';
import { newLettingSchema } from '@/domain/lettings/new-letting';
import { DUPLICATE_DISTANCE, hammingDistance } from '@/domain/media/photos';
import { viewingSessionSchema } from '@/domain/viewings/viewing-session';
import { env } from '@/lib/env';
import { irishToday } from '@/lib/format';
import { findMember, type Member } from '@/server/auth/member';
import { findStaff } from '@/server/auth/staff';
import { createLetting } from '@/server/lettings/create-letting';
import { startTakingEnquiries } from '@/server/lettings/go-live';
import { recordRentCheck } from '@/server/lettings/rent-check';
import { setCriteria } from '@/server/lettings/set-criteria';
import { addViewingSession } from '@/server/lettings/viewing-sessions';
import {
  describePhoto,
  removePhoto,
  saveDescription,
  saveHomeDetails,
  saveLettingDetails,
} from '@/server/listings/editor';
import { confirmAvailable } from '@/server/listings/freshness';
import { publishListing } from '@/server/listings/publish';
import { photoHash, processMedia } from '@/server/media/process';
import { finishPhotoUpload, startHomePhotoUpload } from '@/server/media/upload';
import { createOrganisation } from '@/server/organisations/create-organisation';
import { updateAgencyProfile, updateMyProfile } from '@/server/organisations/profile';
import { recordPlatformEvent } from '@/server/record/platform-events';
import { recordIdentityOutcome } from '@/server/identity/identity';
import { startIdentityCheck } from '@/server/verification/identity';
import { decideLicenceCheck } from '@/server/verification/licence';
import {
  scenePhoto,
  seedPhoto,
  seedPhotos,
  type Framing,
  type SceneKind,
  type SeedPhoto,
} from './seed-photos';

/**
 * The test copy's made-up letters and homes, so renters have homes to search, save and enquire
 * on from the first visit. Every name, address and email here is invented; the emails are at
 * ".example" addresses, so their mail stays in the outbox. Safe to run on every deploy: what
 * exists is kept, viewing times are topped up, and listings are confirmed as still available.
 */

interface SeedHome {
  letting: Record<string, string>;
  details: Record<string, string>;
  description: string;
  criteria: { maxOccupants: number; noPets: boolean };
  /** Its photos (data/seed-photos), the cover first. */
  photos: SeedPhoto[];
  /** The seed of the drawings earlier seeds added, so they can be swapped for photos. */
  photoSeed: number;
}

interface SeedLetter {
  kind: 'agency' | 'landlord';
  organisation: string;
  person: string;
  email: string;
  phone: string;
  licence?: string;
  agentLicence?: string;
  about?: string;
  verifiedName?: string;
  /** Each letter's photos are framed their own way, so none looks copied from another's (M29). */
  framing: Framing;
  homes: SeedHome[];
}

const landlord = { landlordName: 'Brendan Hayes', landlordEmail: 'brendan.hayes@example.ie' };

export const seedLetters: SeedLetter[] = [
  {
    kind: 'agency',
    organisation: 'Halcyon Lettings',
    framing: 'full',
    person: 'Ann Power',
    email: 'ann@halcyon-lettings.example',
    phone: '+353870000101',
    licence: '004812',
    agentLicence: '004813',
    about:
      'A small lettings agency in south Dublin. We manage homes for private landlords in Dublin 6, 8 and 9, and answer every enquiry within a working day.',
    homes: [
      {
        letting: {
          addressLine1: 'Apartment 4, 7 Beechfield Terrace',
          area: 'Ranelagh, Dublin 6',
          county: 'Dublin',
          eircode: 'D06 K2T4',
          rent: '2,250',
          propertyType: 'apartment',
          bedrooms: '2',
          bathrooms: '1',
          furnished: 'furnished',
          berRating: 'B2',
          parking: 'street',
          otherFacts:
            'Gas central heating\nBins are collected on Tuesdays\nThe Luas stop at Ranelagh is a 5-minute walk\nPermit parking on the street, one permit for the apartment',
          ...landlord,
        },
        details: {
          heating: 'gas',
          outdoorSpace: 'balcony',
          floorAreaSqm: '72',
          floor: '2',
          hasLift: 'yes',
          appliances: 'washing_machine,dishwasher,fridge_freezer,oven,microwave',
          broadband: 'fibre',
        },
        description:
          'A bright two-bedroom apartment on the second floor of a quiet red-brick terrace, five minutes’ walk from Ranelagh village and the Luas. The living room opens onto a south-facing balcony. The kitchen is fully fitted, with a dishwasher and washing machine. Both bedrooms are doubles with built-in wardrobes. Fibre broadband is connected.',
        criteria: { maxOccupants: 3, noPets: true },
        photos: [
          'living-room-and-kitchen',
          'bed-by-the-window',
          'living-room-tall-windows',
          'outside',
        ],
        photoSeed: 11,
      },
      {
        letting: {
          addressLine1: 'Flat 2, 31 Orchard Row',
          area: 'Rathmines, Dublin 6',
          county: 'Dublin',
          eircode: 'D06 P8W3',
          rent: '1,750',
          propertyType: 'apartment',
          bedrooms: '1',
          bathrooms: '1',
          furnished: 'furnished',
          berRating: 'C1',
          parking: 'none',
          otherFacts:
            'Electric storage heating\nBins are collected on Mondays\nBike storage in the back garden',
          ...landlord,
        },
        details: {
          heating: 'electric',
          outdoorSpace: 'shared_garden',
          floorAreaSqm: '45',
          floor: '1',
          hasLift: 'no',
          appliances: 'washing_machine,fridge_freezer,oven',
          broadband: 'fibre',
        },
        description:
          'A one-bedroom flat on the first floor of a period house just off Rathmines Road. High ceilings and tall sash windows make it light all day. There is a separate kitchen, a shower room and a shared back garden with secure bike storage. Shops, cafés and buses into town are at the end of the road.',
        criteria: { maxOccupants: 2, noPets: true },
        photos: ['bed-by-the-window', 'living-room-and-kitchen', 'outside'],
        photoSeed: 23,
      },
      {
        letting: {
          addressLine1: '19 Millbrook Avenue',
          area: 'Drumcondra, Dublin 9',
          county: 'Dublin',
          eircode: 'D09 X4N7',
          rent: '2,950',
          propertyType: 'house',
          bedrooms: '3',
          bathrooms: '2',
          furnished: 'part_furnished',
          berRating: 'C2',
          parking: 'space',
          otherFacts:
            'Gas central heating\nBins are collected on Thursdays\nOff-street parking for one car\nThe back garden faces west',
          ...landlord,
        },
        details: {
          heating: 'gas',
          outdoorSpace: 'garden',
          floorAreaSqm: '105',
          appliances: 'washing_machine,dryer,dishwasher,fridge_freezer,oven',
          broadband: 'fibre',
        },
        description:
          'A three-bedroom semi-detached house on a leafy avenue near Drumcondra village. Downstairs there is a living room with a stove, a kitchen-dining room and a toilet. Upstairs are two double bedrooms, a single and a family bathroom. The back garden faces west and there is parking for one car in the drive.',
        criteria: { maxOccupants: 5, noPets: false },
        photos: ['living-room-tall-windows', 'living-room-and-kitchen', 'bed-by-the-window'],
        photoSeed: 37,
      },
      {
        letting: {
          addressLine1: 'Studio 5, 12 Canal View',
          area: 'Portobello, Dublin 8',
          county: 'Dublin',
          eircode: 'D08 R6K2',
          rent: '1,450',
          propertyType: 'studio',
          bedrooms: '0',
          bathrooms: '1',
          furnished: 'furnished',
          berRating: 'B3',
          parking: 'none',
          otherFacts:
            'Electric heating\nBins are collected on Wednesdays\nThe canal is across the road',
          ...landlord,
        },
        details: {
          heating: 'electric',
          outdoorSpace: 'none',
          floorAreaSqm: '32',
          floor: '3',
          hasLift: 'yes',
          appliances: 'washing_machine,fridge_freezer,microwave,oven',
          broadband: 'fibre',
        },
        description:
          'A compact studio on the third floor of a modern block beside the Grand Canal at Portobello. One open room with a kitchen along one wall, a sofa bed area and a shower room. There is a lift, and the windows look out over the water. The city centre is a fifteen-minute walk away.',
        criteria: { maxOccupants: 1, noPets: true },
        photos: ['studio', 'bed-by-the-window', 'outside'],
        photoSeed: 41,
      },
    ],
  },
  {
    kind: 'agency',
    organisation: 'Wren & Weir Lettings',
    framing: 'left',
    person: 'Cian Moran',
    email: 'cian@wren-weir.example',
    phone: '+353870000202',
    licence: '007351',
    agentLicence: '007352',
    about:
      'Lettings across Galway city, from Salthill to Knocknacarra. We look after houses and apartments for landlords who live locally and abroad.',
    homes: [
      {
        letting: {
          addressLine1: '8 Seapoint Grove',
          area: 'Salthill, Galway city',
          county: 'Galway',
          eircode: 'H91 T2C8',
          rent: '1,950',
          propertyType: 'house',
          bedrooms: '2',
          bathrooms: '1',
          furnished: 'furnished',
          berRating: 'C1',
          parking: 'space',
          otherFacts:
            'Gas central heating\nBins are collected on Fridays\nThe promenade is a 3-minute walk',
          ...landlord,
        },
        details: {
          heating: 'gas',
          outdoorSpace: 'patio',
          floorAreaSqm: '78',
          appliances: 'washing_machine,dryer,fridge_freezer,oven',
          broadband: 'other',
        },
        description:
          'A two-bedroom terraced house a short walk from the promenade in Salthill. The front room has a bay window, and the kitchen opens onto a sunny paved yard at the back. Upstairs are a double, a single and a bathroom with an electric shower. There is a parking space in front of the house.',
        criteria: { maxOccupants: 3, noPets: false },
        photos: ['living-room-tall-windows', 'bed-by-the-window', 'living-room-and-kitchen'],
        photoSeed: 53,
      },
      {
        letting: {
          addressLine1: 'Apartment 12, The Weir',
          area: 'Galway city',
          county: 'Galway',
          eircode: 'H91 W5D3',
          rent: '1,400',
          propertyType: 'apartment',
          bedrooms: '1',
          bathrooms: '1',
          furnished: 'furnished',
          berRating: 'B1',
          parking: 'none',
          otherFacts:
            'Heating by heat pump\nBins are in the basement and collected weekly\nNo parking, but there is a bike room',
          ...landlord,
        },
        details: {
          heating: 'heat_pump',
          outdoorSpace: 'balcony',
          floorAreaSqm: '50',
          floor: '4',
          hasLift: 'yes',
          appliances: 'washing_machine,dishwasher,fridge_freezer,oven,microwave',
          broadband: 'fibre',
        },
        description:
          'A one-bedroom apartment on the fourth floor, overlooking the river in the city centre. It has an open-plan living room and kitchen, a double bedroom and a bathroom with a bath. The balcony catches the evening sun. Heating is by heat pump, and the building has a lift and a bike room.',
        criteria: { maxOccupants: 2, noPets: true },
        photos: ['living-room-and-kitchen', 'bed-by-the-window', 'outside'],
        photoSeed: 67,
      },
      {
        letting: {
          addressLine1: '23 Ardmore Park',
          area: 'Knocknacarra, Galway city',
          county: 'Galway',
          eircode: 'H91 F7X2',
          rent: '2,600',
          propertyType: 'house',
          bedrooms: '4',
          bathrooms: '3',
          furnished: 'unfurnished',
          berRating: 'B2',
          parking: 'space',
          otherFacts:
            'Heating by heat pump\nBins are collected on Tuesdays\nParking for two cars\nThe nearest bus stop is on the main road, a 4-minute walk',
          ...landlord,
        },
        details: {
          heating: 'heat_pump',
          outdoorSpace: 'garden',
          floorAreaSqm: '140',
          appliances: 'washing_machine,dryer,dishwasher,fridge_freezer,oven',
          broadband: 'fibre',
        },
        description:
          'A four-bedroom detached house in a quiet estate in Knocknacarra, with a large back garden. Downstairs there is a living room, a playroom or study, a kitchen-dining room and a utility room. Upstairs, the main bedroom has an en-suite, and there are three more bedrooms and a bathroom. Parking for two cars.',
        criteria: { maxOccupants: 6, noPets: false },
        photos: ['bed-by-the-window', 'living-room-tall-windows', 'living-room-and-kitchen'],
        photoSeed: 79,
      },
    ],
  },
  {
    kind: 'landlord',
    organisation: 'Siobhán Daly',
    framing: 'right',
    person: 'Siobhán Daly',
    email: 'siobhan@daly-homes.example',
    phone: '+353870000303',
    verifiedName: 'Siobhán Daly',
    homes: [
      {
        letting: {
          addressLine1: '6 Lough View',
          area: 'Ballintemple, Cork city',
          county: 'Cork',
          eircode: 'T12 E4H6',
          rent: '1,800',
          propertyType: 'house',
          bedrooms: '2',
          bathrooms: '1',
          furnished: 'furnished',
          berRating: 'D1',
          parking: 'street',
          otherFacts:
            'Gas central heating\nBins are collected on Wednesdays\nThe Lough is at the end of the road',
        },
        details: {
          heating: 'gas',
          outdoorSpace: 'garden',
          floorAreaSqm: '70',
          appliances: 'washing_machine,fridge_freezer,oven',
          broadband: 'other',
        },
        description:
          'My two-bedroom end-of-terrace house near the Lough in Ballintemple. It has a cosy front room with an open fire, a kitchen with space to eat, a double bedroom, a single bedroom and a bathroom upstairs. The back garden is small and private. Buses to the city centre stop at the corner.',
        criteria: { maxOccupants: 3, noPets: true },
        photos: ['living-room-tall-windows', 'bed-by-the-window', 'living-room-and-kitchen'],
        photoSeed: 83,
      },
      {
        letting: {
          addressLine1: 'Apartment 3, 15 Quay Street',
          area: 'Cork city',
          county: 'Cork',
          eircode: 'T12 Y9P5',
          rent: '1,350',
          propertyType: 'apartment',
          bedrooms: '1',
          bathrooms: '1',
          furnished: 'part_furnished',
          berRating: 'C3',
          parking: 'none',
          otherFacts:
            'Electric heating\nBins are collected on Mondays\nThe apartment is above a bookshop',
        },
        details: {
          heating: 'electric',
          outdoorSpace: 'none',
          floorAreaSqm: '42',
          floor: '1',
          hasLift: 'no',
          appliances: 'washing_machine,fridge_freezer,oven,microwave',
          broadband: 'fibre',
        },
        description:
          'A one-bedroom apartment on the first floor of an old building on the quays, above a bookshop. The living room has two big windows onto the river. There is a galley kitchen, a double bedroom and a shower room. It comes with a bed, a sofa and a table; you bring the rest.',
        criteria: { maxOccupants: 2, noPets: true },
        photos: ['outside', 'living-room-and-kitchen', 'bed-by-the-window'],
        photoSeed: 97,
      },
    ],
  },
];

const SCENES: SceneKind[] = ['outside', 'living', 'kitchen', 'bedroom'];
const REVIEWER_EMAIL = 'reviewer@gaff-staff.example';

export interface SeedReport {
  letters: { created: number; existing: number };
  homes: { listed: number; existing: number; held: number; problems: number };
  viewingsAdded: number;
  confirmed: number;
  /** Existing homes whose drawn photos were swapped for photos. */
  photosSwapped: number;
}

function daysFrom(now: Date, days: number): string {
  return irishToday(new Date(now.getTime() + days * 86_400_000));
}

async function userByEmail(email: string): Promise<string | null> {
  const [row] = await db().select({ id: users.id }).from(users).where(eq(users.email, email));
  return row?.id ?? null;
}

async function seedReviewer() {
  let id = await userByEmail(REVIEWER_EMAIL);
  if (!id) {
    id = crypto.randomUUID();
    await db()
      .insert(users)
      .values({ id, name: 'Gaff test reviewer', email: REVIEWER_EMAIL, emailVerified: true });
  }
  await db().insert(staffMembers).values({ userId: id, role: 'reviewer' }).onConflictDoNothing();
  return (await findStaff(id))!;
}

async function confirmMobile(userId: string, phone: string, now: Date) {
  await withRenter(userId, async (tx) => {
    await tx
      .insert(phoneConfirmations)
      .values({ userId, phone, confirmedPhone: phone, confirmedAt: now })
      .onConflictDoUpdate({
        target: phoneConfirmations.userId,
        set: { phone, confirmedPhone: phone, confirmedAt: now },
      });
    await recordPlatformEvent(tx, {
      type: 'mobile.confirmed',
      actor: { type: 'person', userId },
      data: {},
    });
  });
}

/** A made-up letter whose checks have all passed, as if they'd been through onboarding. */
async function seedLetter(
  letter: SeedLetter,
  reviewer: Awaited<ReturnType<typeof seedReviewer>>,
  now: Date,
): Promise<{ member: Member; created: boolean }> {
  const existingId = await userByEmail(letter.email);
  const existing = existingId ? await findMember(existingId) : null;
  if (existing) return { member: existing, created: false };

  const userId = existingId ?? crypto.randomUUID();
  if (!existingId) {
    await db()
      .insert(users)
      .values({ id: userId, name: letter.person, email: letter.email, emailVerified: true });
  }
  await createOrganisation(userId, {
    yourName: letter.person,
    name: letter.organisation,
    kind: letter.kind,
    psraLicenceNumber: letter.licence,
  });
  const member = (await findMember(userId))!;
  await confirmMobile(userId, letter.phone, now);

  if (letter.kind === 'agency') {
    await updateAgencyProfile(member, {
      legalName: letter.organisation,
      about: letter.about ?? '',
    });
    await updateMyProfile(member, {
      displayName: letter.person,
      showPhone: 'no',
      psraLicenceNumber: letter.agentLicence!,
    });
    const pending = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ id: letterChecks.id })
        .from(letterChecks)
        .where(
          and(
            eq(letterChecks.organisationId, member.organisationId),
            eq(letterChecks.method, 'psra_register'),
            inArray(letterChecks.status, ['pending', 'needs_review']),
          ),
        ),
    );
    for (const check of pending) {
      await decideLicenceCheck(reviewer, check.id, { outcome: 'passed' }, now);
    }
  } else {
    const { redirectUrl } = await startIdentityCheck(member, { selfie: true, consented: true });
    const checkId = /\/dev\/identity\/([^/?]+)/.exec(redirectUrl)?.[1];
    if (!checkId) throw new Error('The stand-in ID check did not start');
    const [first = letter.person, ...rest] = (letter.verifiedName ?? letter.person).split(' ');
    await recordIdentityOutcome({
      checkId,
      userId: member.userId,
      outcome: { status: 'passed', verifiedName: { first, last: rest.join(' ') || first } },
      now,
    });
  }
  return { member, created: true };
}

/** Uploads a home's photos as a letter would, in order, each described for screen readers. */
async function addPhotos(
  member: Member,
  lettingId: string,
  homeId: string,
  framing: Framing,
  photos: readonly SeedPhoto[],
) {
  for (const photo of photos) {
    const body = await seedPhoto(photo, framing);
    const { mediaId, upload } = await startHomePhotoUpload(member, homeId, {
      contentType: 'image/jpeg',
      bytes: body.length,
    });
    const key = new URL(upload.url).searchParams.get('key');
    if (!key) throw new Error('The test copy stores photos itself; the upload key is missing');
    await objectStorage().write('uploads', key, body, 'image/jpeg');
    await finishPhotoUpload(member, mediaId);
    await processMedia({ organisationId: member.organisationId, mediaId });
    await describePhoto(member, lettingId, mediaId, { altText: seedPhotos[photo], isCgi: false });
  }
}

/**
 * Earlier seeds drew each home's photos. Swaps any of those drawings still on a home for its
 * photos: the photos go on first, so the listing never has too few, then the drawings come off.
 * Photos a tester added stay.
 */
async function swapDrawings(
  member: Member,
  lettingId: string,
  homeId: string,
  framing: Framing,
  home: SeedHome,
): Promise<boolean> {
  const drawn = await Promise.all(
    SCENES.map(async (scene, i) => photoHash(await scenePhoto(scene, home.photoSeed * 100 + i))),
  );
  const onHome = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ id: media.id, phash: media.phash })
      .from(media)
      .where(and(eq(media.homeId, homeId), eq(media.kind, 'photo'), isNotNull(media.phash))),
  );
  const drawings = onHome.filter((photo) =>
    drawn.some(
      (hash) => hammingDistance(BigInt.asUintN(64, photo.phash!), hash) <= DUPLICATE_DISTANCE,
    ),
  );
  if (drawings.length === 0) return false;
  await addPhotos(member, lettingId, homeId, framing, home.photos);
  for (const drawing of drawings) await removePhoto(member, lettingId, drawing.id);
  return true;
}

/** Two viewing times in the next week: an evening, and a Saturday-style late morning. */
function viewingTimes(now: Date) {
  return [
    viewingSessionSchema(now).parse({
      date: daysFrom(now, 3),
      start: '18:00',
      end: '19:00',
      kind: 'slots',
      slotMinutes: '15',
    }),
    viewingSessionSchema(now).parse({
      date: daysFrom(now, 6),
      start: '11:00',
      end: '12:00',
      kind: 'group',
      capacity: '8',
    }),
  ];
}

async function listHome(member: Member, framing: Framing, home: SeedHome, now: Date) {
  const letting = newLettingSchema(now).parse({
    addressLine2: '',
    availableFrom: daysFrom(now, 21),
    photosUrl: '',
    daftUrl: '',
    myhomeUrl: '',
    landlordName: '',
    landlordEmail: '',
    ...home.letting,
  });
  const { lettingId } = await createLetting(member, letting);
  for (const session of viewingTimes(now)) await addViewingSession(member, lettingId, session);
  await setCriteria(member, lettingId, home.criteria);
  await recordRentCheck(member, lettingId, { lastLet: 'never' }, letting.rent);
  await startTakingEnquiries(member, lettingId);
  const [row] = await withOrg(member.organisationId, (tx) =>
    tx.select({ homeId: lettings.homeId }).from(lettings).where(eq(lettings.id, lettingId)),
  );
  await saveHomeDetails(member, lettingId, {
    showExactAddress: 'no',
    accessibility: '',
    ensuites: '',
    berNumber: '',
    berCertificateDate: '',
    ...home.details,
  });
  await saveLettingDetails(member, lettingId, { deposit: home.letting.rent! });
  await saveDescription(member, lettingId, home.description);
  await addPhotos(member, lettingId, row!.homeId, framing, home.photos);
  return publishListing(member, lettingId, { declare: true }, now);
}

/** Keeps a seeded home listable: a viewing time ahead, and confirmed as still available. */
async function refreshHome(member: Member, lettingId: string, now: Date) {
  let viewingsAdded = 0;
  let confirmed = 0;
  const [upcoming] = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ id: viewingSessions.id })
      .from(viewingSessions)
      .where(and(eq(viewingSessions.lettingId, lettingId), gt(viewingSessions.startsAt, now)))
      .limit(1),
  );
  if (!upcoming) {
    for (const session of viewingTimes(now)) {
      try {
        await addViewingSession(member, lettingId, session);
        viewingsAdded += 1;
      } catch {
        // A tester added a time that overlaps; theirs stays.
      }
    }
  }
  const [listing] = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ id: listings.id, status: listings.status })
      .from(listings)
      .where(eq(listings.lettingId, lettingId))
      .orderBy(desc(listings.createdAt))
      .limit(1),
  );
  if (listing && (listing.status === 'live' || listing.status === 'paused')) {
    try {
      await confirmAvailable(member, listing.id, now);
      confirmed += 1;
    } catch {
      // Paused by a person at Gaff, not by time: leave it for them.
    }
  }
  return { viewingsAdded, confirmed };
}

/** Seeds the test copy. Never runs in production. */
export async function seedTestCopy(now = new Date()): Promise<SeedReport> {
  if (env().GAFF_ENV === 'production') throw new Error('The seed never runs in production');
  const report: SeedReport = {
    letters: { created: 0, existing: 0 },
    homes: { listed: 0, existing: 0, held: 0, problems: 0 },
    viewingsAdded: 0,
    confirmed: 0,
    photosSwapped: 0,
  };
  const reviewer = await seedReviewer();
  for (const letter of seedLetters) {
    const { member, created } = await seedLetter(letter, reviewer, now);
    report.letters[created ? 'created' : 'existing'] += 1;
    for (const home of letter.homes) {
      const [existing] = await withOrg(member.organisationId, (tx) =>
        tx
          .select({ lettingId: lettings.id, homeId: lettings.homeId })
          .from(lettings)
          .innerJoin(homes, eq(homes.id, lettings.homeId))
          .where(
            and(
              eq(homes.organisationId, member.organisationId),
              eq(homes.addressLine1, home.letting.addressLine1!),
            ),
          )
          .orderBy(desc(lettings.createdAt))
          .limit(1),
      );
      if (existing) {
        report.homes.existing += 1;
        const refreshed = await refreshHome(member, existing.lettingId, now);
        report.viewingsAdded += refreshed.viewingsAdded;
        report.confirmed += refreshed.confirmed;
        const swapped = await swapDrawings(
          member,
          existing.lettingId,
          existing.homeId,
          letter.framing,
          home,
        );
        if (swapped) report.photosSwapped += 1;
        continue;
      }
      const result = await listHome(member, letter.framing, home, now);
      if (result.outcome === 'live') report.homes.listed += 1;
      else if (result.outcome === 'held') report.homes.held += 1;
      else report.homes.problems += 1;
    }
  }
  return report;
}

/** Whether this build should seed: the test copy's production deployment only (not previews). */
export function shouldSeed(source: Record<string, string | undefined>): boolean {
  if (source.GAFF_ENV !== 'staging') return false;
  return source.VERCEL !== '1' || source.VERCEL_ENV === 'production';
}
