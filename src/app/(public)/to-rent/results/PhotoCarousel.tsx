'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import styles from '../search.module.css';

export interface CarouselPhoto {
  src: string;
  srcSet: string;
  alt: string;
  width: number;
  height: number;
}

/**
 * M60: a result's photos, to swipe on a phone, or step through with the arrows that appear on
 * hover and focus. A tap opens the home's page. The title is the card's link for keyboards and
 * screen readers, so the photos aren't a second one.
 */
export function PhotoCarousel({
  photos,
  href,
  title,
  eager,
}: {
  photos: CarouselPhoto[];
  href: string;
  title: string;
  eager: boolean;
}) {
  const router = useRouter();
  const strip = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);
  const step = (direction: 1 | -1) => {
    const el = strip.current;
    if (!el) return;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: direction * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  };
  return (
    <div className={styles.carousel}>
      <ul
        ref={strip}
        className={styles.strip}
        aria-label={`Photos of ${title}`}
        onScroll={(event) => {
          const el = event.currentTarget;
          setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
        onClick={() => router.push(href)}
      >
        {photos.map((photo, i) => (
          <li key={photo.src} className={styles.stripItem}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.src}
              srcSet={photo.srcSet}
              sizes="(min-width: 1440px) 380px, (min-width: 744px) 45vw, 100vw"
              width={photo.width}
              height={photo.height}
              alt={photo.alt}
              loading={eager && i === 0 ? 'eager' : 'lazy'}
              fetchPriority={eager && i === 0 ? 'high' : undefined}
              className={styles.photo}
            />
          </li>
        ))}
      </ul>
      {photos.length > 1 ? (
        <>
          <button
            type="button"
            className={`${styles.arrow} ${styles.arrowPrev}`}
            aria-label={`Previous photo of ${title}`}
            hidden={index === 0}
            onClick={() => step(-1)}
          >
            <ChevronLeft size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${styles.arrow} ${styles.arrowNext}`}
            aria-label={`Next photo of ${title}`}
            hidden={index >= photos.length - 1}
            onClick={() => step(1)}
          >
            <ChevronRight size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>
          <div className={styles.dots} aria-hidden="true">
            {photos.slice(0, 5).map((photo, i) => (
              <span key={photo.src} data-on={Math.min(index, 4) === i || undefined} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
