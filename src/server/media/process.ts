import { and, eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { objectStorage } from '@/adapters/storage';
import { withOrg } from '@/db/client';
import { listings, media } from '@/db/schema';
import {
  MIN_PHOTO_PIXELS,
  PHOTO_WIDTHS,
  differenceHash,
  mediaKeys,
  sniffImageType,
  toSigned64,
} from '@/domain/media/photos';
import { recordEvent } from '@/server/record/events';
import { republishIfPublic } from '@/server/listings/editor';

type Rejection = 'not_an_image' | 'too_small' | 'unreadable' | 'missing';

interface Processed {
  width: number;
  height: number;
  widths: number[];
  phash: bigint;
  placeholder: string;
}

/** No more than 100 megapixels: anything bigger is refused before it's decoded. */
const pixelLimit = { limitInputPixels: 100_000_000, failOn: 'error' as const };

/**
 * M43: checks an uploaded photo by its bytes, turns it the right way up, and writes the fixed
 * sizes renters see. sharp removes all metadata (location, camera) unless asked to keep it, and
 * converts to sRGB. The original is deleted afterwards, whatever the outcome.
 */
async function resize(
  storage: ReturnType<typeof objectStorage>,
  original: Buffer,
  keys: ReturnType<typeof mediaKeys>,
): Promise<Processed | Rejection> {
  if (!sniffImageType(original)) return 'not_an_image';
  try {
    const meta = await sharp(original, pixelLimit).metadata();
    const turned = (meta.orientation ?? 1) >= 5;
    const width = (turned ? meta.height : meta.width) ?? 0;
    const height = (turned ? meta.width : meta.height) ?? 0;
    if (Math.max(width, height) < MIN_PHOTO_PIXELS) return 'too_small';

    const widths = PHOTO_WIDTHS.filter((w) => w <= width);
    if (widths.length === 0) widths.push(PHOTO_WIDTHS[0]);
    for (const w of widths) {
      const body = await sharp(original, pixelLimit)
        .rotate()
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      await storage.write('media', keys.sized(w), body, 'image/webp');
    }
    const preview = await sharp(original, pixelLimit)
      .rotate()
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    await storage.write('media', keys.preview, preview, 'image/jpeg');

    const thumb = await sharp(original, pixelLimit)
      .rotate()
      .greyscale()
      .resize(9, 8, { fit: 'fill' })
      .raw()
      .toBuffer();
    const [r, g, b] = await sharp(original, pixelLimit)
      .rotate()
      .resize(1, 1)
      .removeAlpha()
      .raw()
      .toBuffer();
    const hex = (n: number | undefined) => (n ?? 0).toString(16).padStart(2, '0');
    return {
      width,
      height,
      widths,
      phash: differenceHash(thumb),
      placeholder: `#${hex(r)}${hex(g)}${hex(b)}`,
    };
  } catch {
    return 'unreadable';
  }
}

export async function processMedia(job: {
  organisationId: string;
  mediaId: string;
}): Promise<'ready' | 'rejected' | 'skipped'> {
  const [row] = await withOrg(job.organisationId, (tx) =>
    tx
      .select({ status: media.status, homeId: media.homeId })
      .from(media)
      .where(eq(media.id, job.mediaId)),
  );
  if (!row || row.status !== 'processing') return 'skipped';

  const storage = objectStorage();
  const keys = mediaKeys(job.organisationId, job.mediaId);
  const original = await storage.read('uploads', keys.upload);
  const result = original ? await resize(storage, original, keys) : 'missing';

  await withOrg(job.organisationId, async (tx) => {
    if (typeof result === 'string') {
      await tx
        .update(media)
        .set({ status: 'rejected', rejectReason: result })
        .where(eq(media.id, job.mediaId));
    } else {
      await tx
        .update(media)
        .set({
          status: 'ready',
          width: result.width,
          height: result.height,
          widths: result.widths,
          phash: toSigned64(result.phash),
          placeholder: result.placeholder,
        })
        .where(eq(media.id, job.mediaId));
    }
    // M51: a new photo on a published listing shows straight away.
    if (typeof result !== 'string' && row.homeId) {
      const [open] = await tx
        .select({ lettingId: listings.lettingId })
        .from(listings)
        .where(
          and(
            eq(listings.homeId, row.homeId),
            inArray(listings.status, ['live', 'enquiries_closed']),
          ),
        );
      if (open) await republishIfPublic(tx, open.lettingId, null);
    }
    await recordEvent(tx, {
      organisationId: job.organisationId,
      actor: { type: 'system' },
      type: 'photo.processed',
      subject: { type: 'media', id: job.mediaId },
      data:
        typeof result === 'string'
          ? { mediaId: job.mediaId, outcome: 'rejected', reason: result }
          : { mediaId: job.mediaId, outcome: 'ready' },
    });
  });
  await storage.remove('uploads', [keys.upload]);
  return typeof result === 'string' ? 'rejected' : 'ready';
}
