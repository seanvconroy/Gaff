'use client';

import { ChevronLeft, ChevronRight, Expand, X } from 'lucide-react';
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { PhotoSources } from '../../photos';
import styles from './listing.module.css';

/**
 * M66: the gallery. Swipe or use the buttons on a phone, the arrow keys on a keyboard, and full
 * screen on tap. Every photo has words for screen readers, and the count is announced.
 */
export function Gallery({ photos, title }: { photos: PhotoSources[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [fullScreen, setFullScreen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const start = useRef<number | null>(null);
  const count = photos.length;
  const photo = photos[index]!;
  const go = (step: number) => setIndex((i) => (i + step + count) % count);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(1);
    }
  };
  const onPointerDown = (event: PointerEvent) => {
    start.current = event.clientX;
  };
  const onPointerUp = (event: PointerEvent) => {
    if (start.current === null) return;
    const moved = event.clientX - start.current;
    start.current = null;
    if (Math.abs(moved) > 40) go(moved < 0 ? 1 : -1);
  };

  const image = (large: boolean) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo.src}
      srcSet={photo.srcSet}
      sizes={large ? '100vw' : '(min-width: 1120px) 720px, 100vw'}
      width={photo.width}
      height={photo.height}
      alt={photo.alt}
      fetchPriority={index === 0 && !large ? 'high' : undefined}
      className={large ? styles.lightboxPhoto : styles.galleryPhoto}
      draggable={false}
    />
  );

  const controls = (inDialog: boolean) => (
    <div className={styles.galleryControls}>
      <button type="button" className={styles.iconButton} onClick={() => go(-1)}>
        <ChevronLeft size={24} strokeWidth={1.5} aria-hidden="true" />
        <span className="visually-hidden">Previous photo</span>
      </button>
      <p className={styles.counter} aria-live="polite">
        {photo.kind === 'floor_plan' ? 'Floor plan' : 'Photo'} {index + 1} of {count}
      </p>
      <button type="button" className={styles.iconButton} onClick={() => go(1)}>
        <ChevronRight size={24} strokeWidth={1.5} aria-hidden="true" />
        <span className="visually-hidden">Next photo</span>
      </button>
      {inDialog ? (
        <button type="button" className={styles.iconButton} onClick={() => dialog.current?.close()}>
          <X size={24} strokeWidth={1.5} aria-hidden="true" />
          <span className="visually-hidden">Close full screen</span>
        </button>
      ) : (
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => {
            setFullScreen(true);
            dialog.current?.showModal();
          }}
        >
          <Expand size={24} strokeWidth={1.5} aria-hidden="true" />
          <span className="visually-hidden">See full screen</span>
        </button>
      )}
    </div>
  );

  return (
    // Arrow keys work anywhere in the gallery, including full screen (the dialog is inside).
    <section className={styles.gallery} aria-label={`Photos of ${title}`} onKeyDown={onKeyDown}>
      <div className={styles.galleryFrame} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        {image(false)}
      </div>
      {count > 1 ? controls(false) : null}
      <dialog
        ref={dialog}
        className={styles.lightbox}
        aria-label={`Photos of ${title}, full screen`}
        onClose={() => setFullScreen(false)}
      >
        {/* Rendered only while open, so the photo count is announced once. */}
        {fullScreen ? (
          <>
            <div
              className={styles.lightboxFrame}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
            >
              {image(true)}
            </div>
            {controls(true)}
          </>
        ) : null}
      </dialog>
    </section>
  );
}
