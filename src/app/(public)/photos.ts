import { objectStorage } from '@/adapters/storage';
import type { ProjectionPhoto } from '@/domain/listings/projection';

/**
 * M43, ADR-0021: photos are served at fixed widths from storage. The browser picks the width
 * it needs from srcset, so a phone never downloads the large sizes.
 */
export interface PhotoSources {
  src: string;
  srcSet: string;
  width: number;
  height: number;
  alt: string;
  kind: ProjectionPhoto['kind'];
}

export function photoSources(photo: ProjectionPhoto, fallbackAlt: string): PhotoSources {
  const storage = objectStorage();
  const widths = [...photo.widths].sort((a, b) => a - b);
  const url = (width: number) => storage.publicUrl(`${photo.key}/${width}.webp`);
  return {
    src: url(widths[Math.min(1, widths.length - 1)]!),
    srcSet: widths.map((w) => `${url(w)} ${w}w`).join(', '),
    width: photo.width,
    height: photo.height,
    alt: photo.alt ?? (photo.kind === 'floor_plan' ? 'Floor plan' : fallbackAlt),
    kind: photo.kind,
  };
}

/** The 1200px JPEG for link previews (Open Graph). */
export function previewUrl(photo: ProjectionPhoto): string {
  return objectStorage().publicUrl(`${photo.key}/preview.jpg`);
}
