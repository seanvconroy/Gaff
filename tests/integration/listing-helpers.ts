import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { objectStorage } from '@/adapters/storage';
import { db, withOrg } from '@/db/client';
import { lettings, staffMembers, users } from '@/db/schema';
import { findStaff, type Staff } from '@/server/auth/staff';
import { saveDescription, saveHomeDetails, saveLettingDetails } from '@/server/listings/editor';
import { processMedia } from '@/server/media/process';
import { finishPhotoUpload, startHomePhotoUpload } from '@/server/media/upload';
import { recordIdentityOutcome, startIdentityCheck } from '@/server/verification/identity';
import { createTestMember, aLiveLetting, type Member } from './helpers';
import { sendMobileCode } from '@/server/verification/mobile';
import { withRenter } from '@/db/client';
import { phoneConfirmations } from '@/db/schema';

/**
 * A synthetic photo: a coarse grid of colours from a seeded random sequence, enlarged. Different
 * seeds give unrelated pictures (their hashes differ by about half their bits); the same seed
 * gives the same picture, as a copied photo would.
 */
export async function aPhoto(seed = 0, width = 1200, height = 800): Promise<Buffer> {
  let state = (seed * 2654435761) >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const grid = Buffer.alloc(12 * 9 * 3);
  for (let i = 0; i < grid.length; i++) grid[i] = Math.floor(next() * 256);
  return sharp(grid, { raw: { width: 12, height: 9, channels: 3 } })
    .resize(width, height, { kernel: 'nearest' })
    .jpeg()
    .toBuffer();
}

export async function addPhotos(member: Member, homeId: string, shades: number[]) {
  const ids: string[] = [];
  for (const shade of shades) {
    const body = await aPhoto(shade);
    const { mediaId, upload } = await startHomePhotoUpload(member, homeId, {
      contentType: 'image/jpeg',
      bytes: body.length,
    });
    await objectStorage().write(
      'uploads',
      new URL(upload.url).searchParams.get('key')!,
      body,
      'image/jpeg',
    );
    await finishPhotoUpload(member, mediaId);
    await processMedia({ organisationId: member.organisationId, mediaId });
    ids.push(mediaId);
  }
  return ids;
}

/** A private landlord whose mobile and identity Gaff has checked (M22). */
export async function aCheckedLandlord(): Promise<Member> {
  const member = await createTestMember({ kind: 'landlord' });
  await sendMobileCode(member.userId, `087${String(Math.random()).slice(2, 9)}`);
  await withRenter(member.userId, (tx) =>
    tx
      .update(phoneConfirmations)
      .set({ confirmedPhone: '+353870000000', confirmedAt: new Date() })
      .where(eq(phoneConfirmations.userId, member.userId)),
  );
  const { redirectUrl } = await startIdentityCheck(member);
  const checkId = /letter-identity\/[^/]+\/([^/?]+)/.exec(redirectUrl)![1]!;
  await recordIdentityOutcome({
    organisationId: member.organisationId,
    checkId,
    outcome: { status: 'passed', verifiedName: 'Mary Walsh' },
  });
  return member;
}

export const A_DESCRIPTION =
  'A bright two-bedroom apartment on a quiet, tree-lined road, a short walk from the Luas and the shops on Ranelagh village. Gas central heating, a south-facing balcony and a fully fitted kitchen.';

let photoSeed = 100 + Math.floor(Math.random() * 1000);
let listingCount = 0;
/** Shades no other test uses, so photos never look copied from another listing (M29). */
const freshShades = () => {
  photoSeed += 7;
  return [photoSeed, photoSeed + 2, photoSeed + 4];
};

/** A live letting with everything its listing needs, ready to publish. */
export async function aListableLetting(member: Member, shades = freshShades()) {
  const { lettingId } = await aLiveLetting(member);
  const [letting] = await withOrg(member.organisationId, (tx) =>
    tx.select({ homeId: lettings.homeId }).from(lettings).where(eq(lettings.id, lettingId)),
  );
  await saveHomeDetails(member, lettingId, {
    showExactAddress: 'no',
    heating: 'gas',
    outdoorSpace: 'balcony',
    floorAreaSqm: '68',
  });
  await saveLettingDetails(member, lettingId, { deposit: '1,850' });
  // Each listing's words are its own: copied words hold a listing for review (M29).
  listingCount += 1;
  const description = `${A_DESCRIPTION} Listing ${listingCount}-${crypto.randomUUID()}.`;
  await saveDescription(member, lettingId, description);
  const photos = await addPhotos(member, letting!.homeId, shades);
  return { lettingId, homeId: letting!.homeId, photos, description };
}

export async function aStaffMember(): Promise<Staff> {
  const id = crypto.randomUUID();
  await db()
    .insert(users)
    .values({ id, name: 'Gaff reviewer', email: `${id}@staff.gaff.test`, emailVerified: true });
  await db().insert(staffMembers).values({ userId: id, role: 'reviewer' });
  return (await findStaff(id))!;
}
