import { asc, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { objectStorage } from '@/adapters/storage';
import { verifyLocalUpload } from '@/adapters/storage/local';
import { withOrg } from '@/db/client';
import { events, lettings, media } from '@/db/schema';
import { hammingDistance, mediaKeys } from '@/domain/media/photos';
import { createLetting } from '@/server/lettings/create-letting';
import { processMedia } from '@/server/media/process';
import { finishPhotoUpload, startHomePhotoUpload } from '@/server/media/upload';
import { aLetting } from '../fixtures/lettings';
import { createTestMember, queuedJobs, type Member } from './helpers';

/** A synthetic "photo": a gradient with a block, so it has some structure to hash. */
async function aPhoto(
  width: number,
  height: number,
  options: { orientation?: number; shade?: number } = {},
): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const inBlock = x > width / 3 && x < width / 2 && y > height / 4;
      const value = inBlock ? 30 : Math.round((x / width) * 200) + (options.shade ?? 0);
      pixels[i] = value;
      pixels[i + 1] = value;
      pixels[i + 2] = Math.min(255, value + 20);
    }
  }
  let image = sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 90 })
    .withExif({ IFD0: { Artist: 'Synthetic test camera', Copyright: 'Nobody' } });
  if (options.orientation) image = image.withMetadata({ orientation: options.orientation });
  return image.toBuffer();
}

async function aHome(member: Member): Promise<string> {
  const { lettingId } = await createLetting(member, aLetting());
  const [letting] = await withOrg(member.organisationId, (tx) =>
    tx.select({ homeId: lettings.homeId }).from(lettings).where(eq(lettings.id, lettingId)),
  );
  return letting!.homeId;
}

/** Starts an upload, puts the bytes where the browser would, and finishes it. */
async function upload(member: Member, homeId: string, body: Buffer, contentType = 'image/jpeg') {
  const { mediaId, upload } = await startHomePhotoUpload(member, homeId, {
    contentType,
    bytes: body.length,
  });
  const key = new URL(upload.url).searchParams.get('key')!;
  await objectStorage().write('uploads', key, body, contentType);
  await finishPhotoUpload(member, mediaId);
  return mediaId;
}

describe('M43: the photo pipeline', () => {
  it('turns a photo the right way up, removes its metadata and writes the fixed sizes', async () => {
    const member = await createTestMember();
    const homeId = await aHome(member);
    // 1200 × 800 stored sideways: EXIF orientation 6 means "turn 90° clockwise to view".
    const mediaId = await upload(member, homeId, await aPhoto(1200, 800, { orientation: 6 }));

    expect(await queuedJobs('process_media')).toContainEqual({
      organisationId: member.organisationId,
      mediaId,
    });
    expect(await processMedia({ organisationId: member.organisationId, mediaId })).toBe('ready');

    const [row] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(media).where(eq(media.id, mediaId)),
    );
    expect(row).toMatchObject({ status: 'ready', width: 800, height: 1200, widths: [480] });
    expect(row!.placeholder).toMatch(/^#[0-9a-f]{6}$/);

    const keys = mediaKeys(member.organisationId, mediaId);
    const shown = await objectStorage().read('media', keys.sized(480));
    const meta = await sharp(shown!).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.height).toBeGreaterThan(meta.width!);
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(await objectStorage().read('uploads', keys.upload)).toBeNull();

    const logged = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ type: events.type, data: events.data })
        .from(events)
        .where(eq(events.subjectId, mediaId))
        .orderBy(asc(events.id)),
    );
    expect(logged.map((e) => e.type)).toEqual(['photo.added', 'photo.processed']);
  });

  it('refuses a file that isn’t really an image, and one that’s too small', async () => {
    const member = await createTestMember();
    const homeId = await aHome(member);
    const fake = await upload(member, homeId, Buffer.from('<svg onload="alert(1)"></svg>'));
    expect(await processMedia({ organisationId: member.organisationId, mediaId: fake })).toBe(
      'rejected',
    );
    const tiny = await upload(member, homeId, await aPhoto(200, 150));
    expect(await processMedia({ organisationId: member.organisationId, mediaId: tiny })).toBe(
      'rejected',
    );
    const rows = await withOrg(member.organisationId, (tx) =>
      tx.select({ id: media.id, reason: media.rejectReason }).from(media),
    );
    expect(Object.fromEntries(rows.map((r) => [r.id, r.reason]))).toEqual({
      [fake]: 'not_an_image',
      [tiny]: 'too_small',
    });
  });

  it('M29: the same picture gets the same hash, even recompressed and resized', async () => {
    const member = await createTestMember();
    const homeId = await aHome(member);
    const original = await aPhoto(1600, 1200);
    const recompressed = await sharp(original).resize(1000).jpeg({ quality: 60 }).toBuffer();
    const different = await aPhoto(1600, 1200, { shade: 40 });
    const ids = [
      await upload(member, homeId, original),
      await upload(member, homeId, recompressed),
      await upload(member, homeId, await sharp(different).flop().toBuffer()),
    ];
    for (const mediaId of ids)
      await processMedia({ organisationId: member.organisationId, mediaId });
    const rows = await withOrg(member.organisationId, (tx) =>
      tx.select({ id: media.id, phash: media.phash }).from(media),
    );
    const hash = (id: string) => rows.find((r) => r.id === id)!.phash!;
    expect(hammingDistance(hash(ids[0]!), hash(ids[1]!))).toBeLessThanOrEqual(6);
    expect(hammingDistance(hash(ids[0]!), hash(ids[2]!))).toBeGreaterThan(6);
  });

  it('checks the type and size before giving an upload link, and signs the link', async () => {
    const member = await createTestMember();
    const homeId = await aHome(member);
    await expect(
      startHomePhotoUpload(member, homeId, { contentType: 'image/heic', bytes: 10 }),
    ).rejects.toThrow(/iPhone/);
    const other = await createTestMember();
    await expect(
      startHomePhotoUpload(other, homeId, { contentType: 'image/jpeg', bytes: 10 }),
    ).rejects.toThrow(/isn’t in your account/);

    const { upload: target } = await startHomePhotoUpload(member, homeId, {
      contentType: 'image/jpeg',
      bytes: 10,
    });
    const url = new URL(target.url);
    const params = {
      key: url.searchParams.get('key')!,
      contentType: url.searchParams.get('type')!,
      expires: Number(url.searchParams.get('expires')),
      token: url.searchParams.get('token')!,
    };
    const secret = process.env.AUTH_SECRET!;
    expect(verifyLocalUpload(secret, params)).toBe(true);
    expect(verifyLocalUpload(secret, { ...params, key: `${params.key}x` })).toBe(false);
    expect(verifyLocalUpload(secret, params, params.expires + 1)).toBe(false);
  });
});
