'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { dotsFor, photoInView } from './card-photos';
import { reducedMotion } from './motion';
import styles from './CardPhotos.module.css';

/** Longer than a move from one photo to the next ever takes. */
const SETTLE_MS = 1000;

export interface CardPhoto {
  /** Where the picture is served from, at the size a card shows it. */
  src: string;
}

/**
 * A card's photos (section 8, "Home card"; UX-SR-6): the home's photos in place of its cover, to
 * look through without opening the home. One photo at a time, filling the box the card gives it:
 * a strip to swipe, with Previous and Next buttons that do the same (UX-DS-17) and dots that say
 * where it has come to. Pressing a photo opens the home, as the rest of its card does.
 *
 * Only the cover is loaded with the page. The next photo is fetched once the card is pointed at
 * or touched (on a touch screen, once it is well in view), and each one after that as the
 * renter reaches the photo before it, so a list of homes costs one picture a home until someone
 * looks further.
 *
 * The pictures add no words (the card says the home beside them), so the strip is one link kept
 * out of the tab order and the accessibility tree: the card's own link is the one that's named.
 * The buttons are named by the home, and where the strip has come to is said in words.
 */
export function CardPhotos({
  href,
  photos,
  label,
}: {
  /** The home's page: where a press on a photo goes. */
  href: string;
  /** In the lister's order: the first is the cover. */
  photos: readonly CardPhoto[];
  /** The home in words, to name the buttons: "2-bed apartment · Ranelagh, Dublin 6". */
  label?: string;
}) {
  const count = photos.length;
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const previous = useRef<HTMLButtonElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const [shown, setShown] = useState(0);
  /** Photos up to this one have their picture: the one in view, and the one after it. */
  const [reach, setReach] = useState(0);
  const [moved, setMoved] = useState(false);
  /** The button that was pressed has gone (the first or last photo): focus goes to the other. */
  const refocus = useRef(false);
  /**
   * The photo a button is moving the strip to. Until it arrives, the photos it passes on the way
   * aren't where it "is": the dots and the words say where it is going.
   */
  const heading = useRef<number | null>(null);
  const resting = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const warm = () => setReach((now) => Math.max(now, 1));
  /** The renter has the strip in hand (a finger, a wheel): it is wherever they take it. */
  const takeOver = () => {
    heading.current = null;
    warm();
  };

  // A touch screen has no pointing first: the second photo is fetched once the card is well in
  // view, so the first swipe never shows an empty frame.
  useEffect(() => {
    const element = root.current;
    if (!element || count < 2 || !window.matchMedia('(hover: none)').matches) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setReach((now) => Math.max(now, 1));
      },
      { threshold: 0.6 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [count]);

  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    (shown === 0 ? next : previous).current?.focus();
  }, [shown]);

  const arrive = (index: number) => {
    setShown(index);
    setReach((now) => Math.max(now, index + 1));
  };

  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const index = photoInView(el.scrollLeft, el.clientWidth, count);
    if (heading.current !== null) {
      if (index === heading.current) heading.current = null;
      return;
    }
    if (index !== shown) {
      setMoved(true);
      arrive(index);
    }
  };

  /**
   * The strip has come to rest: whatever was asked of it, what's said is where it is. A browser
   * that doesn't say when a scroll ends is given a moment instead (`step`).
   */
  const settle = () => {
    clearTimeout(resting.current);
    const el = track.current;
    if (!el) return;
    heading.current = null;
    arrive(photoInView(el.scrollLeft, el.clientWidth, count));
  };
  useEffect(() => () => clearTimeout(resting.current), []);

  /**
   * One photo on or back. From where the strip really is (or is already heading), never from
   * what was last said: whatever else has moved the strip, a press moves it one photo.
   */
  const step = (by: -1 | 1, from: HTMLButtonElement) => {
    const el = track.current;
    if (!el) return;
    const at = heading.current ?? photoInView(el.scrollLeft, el.clientWidth, count);
    const to = Math.min(count - 1, Math.max(0, at + by));
    // Only when this press takes the strip to an end, where the pressed button goes.
    refocus.current =
      to !== shown && (to === 0 || to === count - 1) && document.activeElement === from;
    setMoved(true);
    arrive(to);
    const left = to * el.clientWidth;
    // Already there: no scroll will come to say so.
    heading.current = Math.abs(el.scrollLeft - left) < 1 ? null : to;
    el.scrollTo({ left, behavior: reducedMotion() ? 'auto' : 'smooth' });
    clearTimeout(resting.current);
    resting.current = setTimeout(settle, SETTLE_MS);
  };

  const of = label ? `: ${label}` : '';
  return (
    <div
      ref={root}
      className={styles.photos}
      onPointerEnter={warm}
      onFocus={warm}
      onTouchStart={takeOver}
      onWheel={takeOver}
    >
      <Link href={href} className={styles.link} tabIndex={-1} aria-hidden="true" prefetch={false}>
        <div
          ref={track}
          className={styles.track}
          data-photo-strip=""
          onScroll={onScroll}
          onScrollEnd={settle}
        >
          {photos.map((photo, index) => (
            <div key={photo.src} className={styles.slide}>
              {index <= reach ? (
                // A home's own photo, already sized where it is stored: nothing for Next to resize.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className={styles.image}
                  src={photo.src}
                  alt=""
                  loading={index === 0 ? 'lazy' : 'eager'}
                  decoding="async"
                  draggable={false}
                />
              ) : null}
            </div>
          ))}
        </div>
      </Link>
      {count > 1 ? (
        <>
          {shown > 0 ? (
            <button
              ref={previous}
              type="button"
              className={`${styles.step} ${styles.previous}`}
              aria-label={`Previous photo${of}`}
              onClick={(event) => step(-1, event.currentTarget)}
            >
              <span className={styles.disc}>
                <ChevronLeft size={16} strokeWidth={2.5} aria-hidden="true" />
              </span>
            </button>
          ) : null}
          {shown < count - 1 ? (
            <button
              ref={next}
              type="button"
              className={`${styles.step} ${styles.next}`}
              aria-label={`Next photo${of}`}
              onClick={(event) => step(1, event.currentTarget)}
            >
              <span className={styles.disc}>
                <ChevronRight size={16} strokeWidth={2.5} aria-hidden="true" />
              </span>
            </button>
          ) : null}
          <div className={styles.dots} aria-hidden="true">
            {dotsFor(count, shown).map((dot) => (
              <span
                key={dot.index}
                className={styles.dot}
                data-current={dot.current || undefined}
                data-small={dot.small || undefined}
              />
            ))}
          </div>
          {/* Said only once the renter has moved it: a list of cards stays quiet as it loads. */}
          <p className="visually-hidden" role="status">
            {moved ? `Photo ${shown + 1} of ${count}` : ''}
          </p>
        </>
      ) : null}
    </div>
  );
}
