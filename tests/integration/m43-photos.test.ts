import { asc, eq, like } from 'drizzle-orm';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { localPhotoStore } from '@/adapters/photos/local';
import { db, withOrg } from '@/db/client';
import { devPhotoStore, events, lettingPhotos, lettings } from '@/db/schema';
import { hammingDistance } from '@/domain/lettings/photo-files';
import { uploadKey } from '@/domain/lettings/photos';
import type { PhotoStore } from '@/ports/photo-store';
import { publicHomePage } from '@/server/homes/public-homes';
import { closeLetting } from '@/server/lettings/close';
import { coverPhotosFor } from '@/server/lettings/cover-photo';
import { letAgain } from '@/server/lettings/let-again';
import {
  addPhoto,
  finishPhotoUpload,
  photosGoStraightToStore,
  removePhoto,
  reorderPhotos,
  setPhotoKind,
  startPhotoUpload,
  sweepPhotoUploads,
} from '@/server/lettings/photos';
import { getLetting } from '@/server/lettings/queries';
import { loadHome } from '@/server/lettings/drafts';
import { timelineFor } from '@/server/timeline/timeline';
import { aPng } from '../fixtures/photos';
import { aLiveLetting, createTestMember, type Member } from './helpers';

/**
 * A made-up "photo": a gradient with a block, so it has some structure to hash, written as a
 * camera would write it: with camera details, a place (GPS) and, if asked, an orientation.
 */
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
    .withExif({
      IFD0: {
        Artist: 'Synthetic test camera',
        Make: 'Made-up Camera Co',
      },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '53/1 19/1 3144/100',
        GPSLongitudeRef: 'W',
        GPSLongitude: '6/1 15/1 1764/100',
      },
    });
  if (options.orientation) image = image.withMetadata({ orientation: options.orientation });
  return image.toBuffer();
}

/** What a camera writes that must never be kept: its name, the place, the GPS tags. */
const telltales = ['Synthetic test camera', 'Made-up Camera Co', 'GPS', 'Exif'];

async function aLetting(member: Member): Promise<string> {
  return (await aLiveLetting(member)).lettingId;
}

async function rowsOf(member: Member, lettingId: string) {
  return withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(lettingPhotos)
      .where(eq(lettingPhotos.lettingId, lettingId))
      .orderBy(asc(lettingPhotos.position)),
  );
}

/** Every file Gaff's local store holds for this organisation. */
async function filesOf(member: Member) {
  return db()
    .select({ key: devPhotoStore.key, bytes: devPhotoStore.bytes })
    .from(devPhotoStore)
    .where(like(devPhotoStore.key, `homes/${member.organisationId}/%`));
}

/**
 * A store that can sign uploads, as Supabase does, keeping everything in the local store: the
 * test "sends" a photo by putting it under the key the address names.
 */
const signingStore: PhotoStore = {
  ...localPhotoStore,
  name: 'supabase',
  async signedUpload(key, contentType) {
    return {
      url: `https://store.example/upload?key=${encodeURIComponent(key)}`,
      method: 'PUT',
      headers: { 'content-type': contentType },
    };
  },
  async removeUploadsBefore() {
    return 0;
  },
};

async function sendStraightToStore(
  member: Member,
  lettingId: string,
  bytes: Buffer,
  contentType = 'image/jpeg',
) {
  const started = await startPhotoUpload(
    member,
    lettingId,
    { contentType, bytes: bytes.length },
    signingStore,
  );
  if (started.via !== 'store') throw new Error(`Not signed: ${JSON.stringify(started)}`);
  const key = new URL(started.target.url).searchParams.get('key')!;
  await signingStore.put(key, { bytes, contentType });
  return { uploadId: started.uploadId, key };
}

describe('M43: the photo pipeline', () => {
  it('M43: turns a photo the right way up, removes its metadata and keeps the fixed sizes', async () => {
    const member = await createTestMember();
    const lettingId = await aLetting(member);
    // 1600 × 1000 stored sideways: EXIF orientation 6 means "turn 90° clockwise to view".
    const taken = await aPhoto(1600, 1000, { orientation: 6 });
    expect((await sharp(taken).metadata()).orientation).toBe(6);
    expect(taken.toString('latin1')).toContain('Synthetic test camera');

    const added = await addPhoto(member, lettingId, taken);
    if (!added.ok) throw new Error(added.problem);

    const [row] = await rowsOf(member, lettingId);
    expect(row).toMatchObject({
      kind: 'photo',
      width: 1000,
      height: 1600,
      widths: [480, 960],
      contentType: 'image/webp',
      storageKey: `homes/${member.organisationId}/${added.photo.id}`,
    });
    expect(typeof row!.phash).toBe('bigint');

    for (const width of [480, 960]) {
      const kept = await localPhotoStore.get(`${row!.storageKey}/${width}.webp`);
      const meta = await sharp(kept!.bytes).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(width);
      // Upright: taller than it is wide, as the camera meant it.
      expect(meta.height).toBeGreaterThan(meta.width!);
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.orientation).toBeUndefined();
    }
    const preview = await localPhotoStore.get(`${row!.storageKey}/preview.jpg`);
    expect((await sharp(preview!.bytes).metadata()).format).toBe('jpeg');
    // Nothing bigger than the photo is made.
    expect(await localPhotoStore.get(`${row!.storageKey}/1440.webp`)).toBeNull();

    // A page asks for the size it needs, and the browser can choose among them.
    expect(added.photo.href).toBe(`/media/${row!.storageKey}/960.webp`);
    expect(added.photo.srcSet).toBe(
      `/media/${row!.storageKey}/480.webp 480w, /media/${row!.storageKey}/960.webp 960w`,
    );
    const covers = await withOrg(member.organisationId, (tx) => coverPhotosFor(tx, [lettingId]));
    expect(covers.get(lettingId)?.src).toBe(`/media/${row!.storageKey}/480.webp`);
  });

  it('M43: a big photo is kept at every fixed width, the largest 2,048 pixels', async () => {
    const member = await createTestMember();
    const lettingId = await aLetting(member);
    const added = await addPhoto(member, lettingId, await aPhoto(2560, 1440));
    if (!added.ok) throw new Error(added.problem);
    const [row] = await rowsOf(member, lettingId);
    expect(row).toMatchObject({ width: 2560, height: 1440, widths: [480, 960, 1440, 2048] });
    const largest = await localPhotoStore.get(`${row!.storageKey}/2048.webp`);
    expect((await sharp(largest!.bytes).metadata()).width).toBe(2048);
  });

  it('M43: no photo Gaff keeps carries a place, a camera or any other metadata', async () => {
    const member = await createTestMember();
    const lettingId = await aLetting(member);
    await addPhoto(member, lettingId, await aPhoto(1200, 900));
    await addPhoto(member, lettingId, await aPhoto(900, 1200, { orientation: 8 }));
    await addPhoto(
      member,
      lettingId,
      aPng([36, 99, 168], { text: 'Taken at 53.3254 N, 6.2549 W' }),
    );
    const sent = await sendStraightToStore(member, lettingId, await aPhoto(1000, 800));
    await finishPhotoUpload(member, lettingId, sent.uploadId, signingStore);

    const files = await filesOf(member);
    // Four photos, each with its sizes and a preview.
    expect(files.length).toBeGreaterThanOrEqual(4 * 2);
    for (const file of files) {
      const bytes = Buffer.from(file.bytes);
      const meta = await sharp(bytes).metadata();
      expect(meta.exif, file.key).toBeUndefined();
      expect(meta.xmp, file.key).toBeUndefined();
      expect(meta.iptc, file.key).toBeUndefined();
      const text = bytes.toString('latin1');
      for (const telltale of [...telltales, '53.3254']) {
        expect(text, file.key).not.toContain(telltale);
      }
    }
  });

  it('M43: refuses a file that isn’t really a photo, a HEIC it can’t read, and one too small', async () => {
    const member = await createTestMember();
    const lettingId = await aLetting(member);
    const svg = Buffer.from('<svg onload="alert(1)"></svg>');
    const heic = Buffer.concat([
      Buffer.from('\0\0\0\x18ftypheic\0\0\0\0mif1heic', 'latin1'),
      Buffer.alloc(64),
    ]);
    // A JPEG by its name and its first bytes, broken after them.
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
    expect(await addPhoto(member, lettingId, svg)).toEqual({ ok: false, problem: 'not_a_photo' });
    expect(await addPhoto(member, lettingId, heic)).toEqual({ ok: false, problem: 'heic' });
    expect(await addPhoto(member, lettingId, broken)).toEqual({ ok: false, problem: 'unreadable' });
    expect(await addPhoto(member, lettingId, aPng([1, 2, 3], { size: 200 }))).toEqual({
      ok: false,
      problem: 'too_small',
    });
    expect(await rowsOf(member, lettingId)).toEqual([]);
    expect(await filesOf(member)).toEqual([]);
  });

  it('M29: the same picture gets a close hash, even recompressed and resized; another doesn’t', async () => {
    const member = await createTestMember();
    const lettingId = await aLetting(member);
    const original = await aPhoto(1600, 1200);
    const recompressed = await sharp(original).resize(1000).jpeg({ quality: 60 }).toBuffer();
    const different = await sharp(await aPhoto(1600, 1200, { shade: 40 }))
      .flop()
      .toBuffer();
    for (const photo of [original, recompressed, different]) {
      expect((await addPhoto(member, lettingId, photo)).ok).toBe(true);
    }
    const [a, b, c] = (await rowsOf(member, lettingId)).map((row) => row.phash!);
    expect(hammingDistance(a!, b!)).toBeLessThanOrEqual(6);
    expect(hammingDistance(a!, c!)).toBeGreaterThan(6);
  });

  it('M43: removing a photo removes every size of it; letting it again copies every size', async () => {
    const member = await createTestMember();
    const lettingId = await aLetting(member);
    const kept = await addPhoto(member, lettingId, await aPhoto(1000, 750));
    const gone = await addPhoto(member, lettingId, await aPhoto(1000, 750, { shade: 30 }));
    if (!kept.ok || !gone.ok) throw new Error('not added');
    await setPhotoKind(member, lettingId, kept.photo.id, 'floor_plan');
    const goneFolder = `homes/${member.organisationId}/${gone.photo.id}`;
    await removePhoto(member, lettingId, gone.photo.id);
    for (const key of ['480.webp', '960.webp', 'preview.jpg']) {
      expect(await localPhotoStore.get(`${goneFolder}/${key}`)).toBeNull();
    }

    await closeLetting(member, lettingId, 'withdrawn');
    const { id: draftId } = await letAgain(member, lettingId);
    const home = await loadHome(member, draftId);
    expect(home?.photos).toEqual([]);
    expect(home?.floorPlans).toHaveLength(1);
    const copy = home!.floorPlans[0]!;
    expect(copy.id).not.toBe(kept.photo.id);
    expect(copy.kind).toBe('floor_plan');
    const folder = `homes/${member.organisationId}/${copy.id}`;
    for (const key of ['480.webp', '960.webp', 'preview.jpg']) {
      expect(await localPhotoStore.get(`${folder}/${key}`)).not.toBeNull();
    }
  });
});

describe('M43: photos sent straight to the store', () => {
  it('M43: with the local store, photos go through Gaff’s own server', async () => {
    const member = await createTestMember();
    const lettingId = await aLetting(member);
    expect(photosGoStraightToStore(localPhotoStore)).toBe(false);
    expect(photosGoStraightToStore(signingStore)).toBe(true);
    expect(
      await startPhotoUpload(
        member,
        lettingId,
        { contentType: 'image/jpeg', bytes: 10 },
        localPhotoStore,
      ),
    ).toEqual({ via: 'server' });
    expect(await sweepPhotoUploads(new Date(), localPhotoStore)).toBe(0);
  });

  it('M43: checks the declared type, size and home before signing an upload', async () => {
    const member = await createTestMember();
    const other = await createTestMember();
    const lettingId = await aLetting(member);
    const start = (who: Member, file: { contentType: string; bytes: number }) =>
      startPhotoUpload(who, lettingId, file, signingStore);
    expect(await start(member, { contentType: 'image/heic', bytes: 10 })).toEqual({
      via: 'none',
      problem: 'heic',
    });
    expect(await start(member, { contentType: 'image/svg+xml', bytes: 10 })).toEqual({
      via: 'none',
      problem: 'not_a_photo',
    });
    expect(await start(member, { contentType: 'image/png', bytes: 26 * 1024 * 1024 })).toEqual({
      via: 'none',
      problem: 'too_big',
    });
    expect(await start(member, { contentType: 'image/png', bytes: 0 })).toEqual({
      via: 'none',
      problem: 'unreadable',
    });
    await expect(start(other, { contentType: 'image/jpeg', bytes: 10 })).rejects.toThrow(
      /couldn’t find/,
    );
    const signed = await start(member, { contentType: 'image/jpeg', bytes: 10 });
    expect(signed).toMatchObject({ via: 'store', target: { method: 'PUT' } });
    if (signed.via !== 'store') return;
    // The upload's key is under the member's own organisation, and is never a photo's key.
    expect(new URL(signed.target.url).searchParams.get('key')).toBe(
      uploadKey(member.organisationId, signed.uploadId),
    );
  });

  it('M43: reads the photo back, cleans it, keeps it, and deletes what was sent', async () => {
    const member = await createTestMember();
    const lettingId = await aLetting(member);
    const { uploadId, key } = await sendStraightToStore(
      member,
      lettingId,
      await aPhoto(1200, 800, { orientation: 6 }),
    );
    const finished = await finishPhotoUpload(member, lettingId, uploadId, signingStore);
    if (!finished.ok) throw new Error(finished.problem);
    expect(await signingStore.get(key)).toBeNull();
    const [row] = await rowsOf(member, lettingId);
    expect(row).toMatchObject({ width: 800, height: 1200, widths: [480] });

    // What isn't a photo is refused, and deleted all the same.
    const fake = await sendStraightToStore(member, lettingId, Buffer.from('<svg></svg>'));
    expect(await finishPhotoUpload(member, lettingId, fake.uploadId, signingStore)).toEqual({
      ok: false,
      problem: 'not_a_photo',
    });
    expect(await signingStore.get(fake.key)).toBeNull();

    // Another organisation can't finish this one's upload: its key is under its own.
    const other = await createTestMember();
    const otherLetting = await aLetting(other);
    const theirs = await sendStraightToStore(member, lettingId, await aPhoto(800, 600));
    expect(await finishPhotoUpload(other, otherLetting, theirs.uploadId, signingStore)).toEqual({
      ok: false,
      problem: 'unreadable',
    });
    expect(await signingStore.get(theirs.key)).not.toBeNull();
    await expect(finishPhotoUpload(member, lettingId, 'not-an-id', signingStore)).rejects.toThrow();
  });
});

describe('M44: floor plans', () => {
  it('M44: a floor plan goes after the photos, is never the cover, and shows on the home’s page', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    const plan = await addPhoto(member, lettingId, await aPhoto(1000, 800, { shade: 10 }));
    const front = await addPhoto(member, lettingId, await aPhoto(1000, 800, { shade: 20 }));
    const kitchen = await addPhoto(member, lettingId, await aPhoto(1000, 800, { shade: 30 }));
    if (!plan.ok || !front.ok || !kitchen.ok) throw new Error('not added');

    const marked = await setPhotoKind(member, lettingId, plan.photo.id, 'floor_plan');
    expect(marked.kind).toBe('floor_plan');
    const detail = await getLetting(member, lettingId);
    expect(detail!.photos.map((p) => p.id)).toEqual([front.photo.id, kitchen.photo.id]);
    expect(detail!.floorPlans.map((p) => p.id)).toEqual([plan.photo.id]);
    const covers = await withOrg(member.organisationId, (tx) => coverPhotosFor(tx, [lettingId]));
    expect(covers.get(lettingId)?.src).toContain(front.photo.id);

    // Dragging can't put a floor plan among the photos.
    await reorderPhotos(member, lettingId, {
      order: [plan.photo.id, kitchen.photo.id, front.photo.id],
    });
    const after = await getLetting(member, lettingId);
    expect(after!.photos.map((p) => p.id)).toEqual([kitchen.photo.id, front.photo.id]);
    expect(after!.floorPlans.map((p) => p.id)).toEqual([plan.photo.id]);
    // Moving the floor plan earlier keeps it among the floor plans.
    await reorderPhotos(member, lettingId, { move: plan.photo.id, direction: 'earlier' });
    expect((await getLetting(member, lettingId))!.floorPlans.map((p) => p.id)).toEqual([
      plan.photo.id,
    ]);

    const [letting] = await withOrg(member.organisationId, (tx) =>
      tx.select({ ref: lettings.publicRef }).from(lettings).where(eq(lettings.id, lettingId)),
    );
    const page = await publicHomePage(letting!.ref);
    if (page?.state !== 'live') throw new Error(`The page is ${page?.state}`);
    expect(page.home.photos).toHaveLength(2);
    expect(page.home.floorPlans).toHaveLength(1);
    expect(page.home.floorPlans[0]!.src).toContain(plan.photo.id);
    // M43: the link preview is the JPEG kept for it.
    expect(page.home.photos[0]!.preview).toMatch(/\/preview\.jpg$/);

    // Marked as a photo again, it goes to the end of the photos.
    await setPhotoKind(member, lettingId, plan.photo.id, 'photo');
    const again = await getLetting(member, lettingId);
    expect(again!.photos.map((p) => p.id)).toEqual([
      kitchen.photo.id,
      front.photo.id,
      plan.photo.id,
    ]);
    expect(again!.floorPlans).toEqual([]);

    // Counts and codes only in the record, and the timeline says what happened.
    const logged = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ data: events.data })
        .from(events)
        .where(eq(events.lettingId, lettingId))
        .orderBy(asc(events.id)),
    );
    const changes = logged
      .map((each) => each.data as Record<string, unknown>)
      .filter((data) => 'floorPlan' in data);
    expect(changes).toEqual([
      { added: 0, removed: 0, reordered: false, count: 3, floorPlan: 'marked' },
      { added: 0, removed: 0, reordered: false, count: 3, floorPlan: 'unmarked' },
    ]);
    const timeline = await timelineFor(member, lettingId);
    expect(JSON.stringify(timeline)).toContain('Photo marked as a floor plan');
  });

  it('M44: a home with only a floor plan has no cover, and isn’t shown on Gaff', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    const plan = await addPhoto(member, lettingId, await aPhoto(1000, 800));
    if (!plan.ok) throw new Error(plan.problem);
    await setPhotoKind(member, lettingId, plan.photo.id, 'floor_plan');
    const covers = await withOrg(member.organisationId, (tx) => coverPhotosFor(tx, [lettingId]));
    expect(covers.has(lettingId)).toBe(false);
    const [letting] = await withOrg(member.organisationId, (tx) =>
      tx.select({ ref: lettings.publicRef }).from(lettings).where(eq(lettings.id, lettingId)),
    );
    expect((await publicHomePage(letting!.ref))?.state).not.toBe('live');
  });
});
