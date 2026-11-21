'use client';

import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import styles from './Gallery.module.css';
import { reducedMotion } from './motion';
import { Overlay } from './Overlay';

export interface GalleryPhoto {
  src: string;
  /** M43: every size kept ("…/480.webp 480w, …"), for the browser to pick the one it needs. */
  srcSet?: string;
  /** M44: a floor plan is shown whole, after the photos, and named as one. */
  kind?: 'photo' | 'floor_plan';
}

const counter = (index: number, count: number) => `${index + 1} of ${count}`;

/** What a picture is called: "Photo 2 of 8", or "Floor plan, 8 of 8". */
const nameOf = (photo: GalleryPhoto, index: number, count: number) =>
  photo.kind === 'floor_plan'
    ? `Floor plan, ${counter(index, count)}`
    : `Photo ${counter(index, count)}`;

/**
 * How wide each picture is shown, for the browser to choose a size (M43): the whole width on a
 * phone; on a desktop, half the width for the cover and a quarter for the rest of the grid.
 */
const sizesFor = (index: number) =>
  index === 0 ? '(min-width: 900px) 50vw, 100vw' : '(min-width: 900px) 25vw, 100vw';

/**
 * A home's photos (section 8, "Gallery"; UX-LS-1). Two layouts either side of 900px, as every
 * adaptive component has (UX-DS-27):
 * - on a phone, one photo at a time at 3:2, to swipe, with Previous and Next buttons that do the
 *   same, so nothing needs a swipe (UX-DS-17), and where you are in words ("2 of 8");
 * - on a desktop, a grid of the first five, the cover large.
 * Tapping or clicking a photo opens it full screen, where Previous, Next, the arrow keys and
 * Escape work. "Show all" opens the first. Floor plans come after the photos and are shown
 * whole, never cropped (M44); each picture is loaded at the size it is shown at (M43). A home on Gaff always has a photo (`onGaffNeeds`), so
 * there is never a broken image; the photos have no words of their own, so each is named by
 * where it is in the list.
 */
export function Gallery({
  photos,
  label,
}: {
  photos: readonly GalleryPhoto[];
  /** What the photos are of: the home's address. */
  label: string;
}) {
  const count = photos.length;
  const track = useRef<HTMLUListElement>(null);
  const [shown, setShown] = useState(0);
  const [open, setOpen] = useState<number | null>(null);

  // On a phone the strip scrolls; where it has come to is the photo shown.
  const onScroll = () => {
    const el = track.current;
    if (!el || el.clientWidth === 0) return;
    setShown(Math.min(count - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth))));
  };

  const go = (to: number) => {
    const el = track.current;
    if (!el) return;
    const index = (to + count) % count;
    el.scrollTo({ left: index * el.clientWidth, behavior: reducedMotion() ? 'auto' : 'smooth' });
    setShown(index);
  };

  if (count === 0) return null;
  return (
    <section className={styles.gallery} aria-label={`Photos of ${label}`}>
      <ul ref={track} className={styles.track} data-count={Math.min(count, 5)} onScroll={onScroll}>
        {photos.map((photo, index) => (
          <li key={photo.src} className={styles.item}>
            <button
              type="button"
              className={styles.open}
              aria-label={`${nameOf(photo, index, count)}, full screen`}
              onClick={() => setOpen(index)}
            >
              {/* A home's own photo, already sized where it is stored. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={`${styles.image} ${photo.kind === 'floor_plan' ? styles.plan : ''}`}
                src={photo.src}
                srcSet={photo.srcSet}
                sizes={photo.srcSet ? sizesFor(index) : undefined}
                alt=""
                loading={index === 0 ? 'eager' : 'lazy'}
                decoding="async"
              />
            </button>
          </li>
        ))}
      </ul>
      {count > 1 ? (
        <div className={styles.controls}>
          <button
            type="button"
            className={`${styles.step} ${styles.previous}`}
            aria-label="Previous photo"
            onClick={() => go(shown - 1)}
          >
            <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
          </button>
          <p className={styles.where} aria-live="polite">
            <span className="visually-hidden">Photo </span>
            {counter(shown, count)}
          </p>
          <button
            type="button"
            className={`${styles.step} ${styles.next}`}
            aria-label="Next photo"
            onClick={() => go(shown + 1)}
          >
            <ChevronRight size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {count > 1 ? (
        <div className={styles.showAll}>
          <Button variant="secondary" onClick={() => setOpen(0)}>
            {`Show all ${count} photos`}
          </Button>
        </div>
      ) : null}
      <FullScreen photos={photos} label={label} index={open} onChange={setOpen} />
    </section>
  );
}

/** One photo at a time, filling the screen at every width. */
function FullScreen({
  photos,
  label,
  index,
  onChange,
}: {
  photos: readonly GalleryPhoto[];
  label: string;
  index: number | null;
  onChange: (index: number | null) => void;
}) {
  const count = photos.length;
  const step = (by: number) => {
    if (index !== null) onChange((index + by + count) % count);
  };

  useEffect(() => {
    if (index === null || count < 2) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') onChange((index + 1) % count);
      if (event.key === 'ArrowLeft') onChange((index - 1 + count) % count);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, count, onChange]);

  const photo = index === null ? null : photos[index];
  return (
    <Overlay
      open={index !== null}
      onClose={() => onChange(null)}
      kind="full"
      label={`Photos of ${label}`}
    >
      {photo && index !== null ? (
        <div className={styles.full}>
          <div className={styles.fullBar}>
            <p className={styles.fullWhere}>{counter(index, count)}</p>
            <button
              type="button"
              className={styles.close}
              aria-label="Close"
              onClick={() => onChange(null)}
            >
              <X size={24} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
          <div className={styles.fullPhoto}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.fullImage}
              src={photo.src}
              srcSet={photo.srcSet}
              sizes={photo.srcSet ? '100vw' : undefined}
              alt={nameOf(photo, index, count)}
            />
          </div>
          {count > 1 ? (
            <div className={styles.fullSteps}>
              <Button variant="secondary" onClick={() => step(-1)}>
                <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
                Previous
              </Button>
              <Button variant="secondary" onClick={() => step(1)}>
                Next
                <ChevronRight size={20} strokeWidth={2} aria-hidden="true" />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Overlay>
  );
}
