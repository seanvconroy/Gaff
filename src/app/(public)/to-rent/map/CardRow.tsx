'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { mapWords, pinPrice } from '@/copy/map';
import type { PinGroup } from '@/domain/map/points';
import type { MapCard } from './types';
import styles from './map.module.css';

/** The row holds the first homes in view; the map's pins still show them all. */
const MAX_ROW_CARDS = 40;
/** The card in the middle of the row is chosen once the swipe settles. */
const SETTLE_MS = 150;

/**
 * M57, M117: on phones and tablets, the homes on the map as a row of cards to swipe along its
 * foot, kept in step with the pins. Tapping a pin brings its card into view; the card a swipe
 * stops on lights up its pin. Homes that share a pin sit side by side, and are all marked when
 * their pin is chosen. Each card loads its photo once it's on screen.
 */
export function CardRow({
  groups,
  chosen,
  chosenGroup,
  onChoose,
  cards,
  requestCard,
}: {
  groups: PinGroup[];
  chosen: string | null;
  chosenGroup: PinGroup | null;
  onChoose: (id: string) => void;
  cards: Record<string, MapCard | null>;
  requestCard: (id: string) => void;
}) {
  const row = useRef<HTMLUListElement>(null);
  const swiped = useRef(false);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const shown = groups.flatMap((group) => group.homes).slice(0, MAX_ROW_CARDS);
  const sharing = chosenGroup && chosenGroup.homes.length > 1 ? chosenGroup.homes : [];

  // A pin was chosen on the map: bring its card into view (not when a swipe chose it).
  useEffect(() => {
    if (!chosen) return;
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    row.current?.querySelector(`[data-id="${CSS.escape(chosen)}"]`)?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
      inline: 'center',
      block: 'nearest',
    });
  }, [chosen]);

  // Cards fetch their photo and rooms as they come on screen.
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.id;
          if (entry.isIntersecting && id) requestCard(id);
        }
      },
      { root: el, threshold: 0.5 },
    );
    el.querySelectorAll('[data-id]').forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [groups, requestCard]);

  useEffect(() => () => clearTimeout(settle.current), []);

  if (shown.length === 0) return null;
  return (
    <ul
      ref={row}
      className={styles.row}
      aria-label={mapWords.homesOnTheMap}
      onScroll={() => {
        clearTimeout(settle.current);
        settle.current = setTimeout(() => {
          const el = row.current;
          if (!el) return;
          const middle = el.getBoundingClientRect().left + el.clientWidth / 2;
          let nearest: { id: string; distance: number } | null = null;
          for (const item of el.querySelectorAll<HTMLElement>('[data-id]')) {
            const box = item.getBoundingClientRect();
            const distance = Math.abs(box.left + box.width / 2 - middle);
            if (!nearest || distance < nearest.distance) {
              nearest = { id: item.dataset.id!, distance };
            }
          }
          if (nearest && nearest.id !== chosen) {
            swiped.current = true;
            onChoose(nearest.id);
          }
        }, SETTLE_MS);
      }}
    >
      {shown.map((pin) => {
        const card = cards[pin.id];
        return (
          <li
            key={pin.id}
            data-id={pin.id}
            className={styles.rowItem}
            aria-current={pin.id === chosen ? 'true' : undefined}
            data-same-point={sharing.includes(pin) || undefined}
          >
            {card?.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.photo.src}
                srcSet={card.photo.srcSet}
                sizes="120px"
                width={card.photo.width}
                height={card.photo.height}
                alt=""
                className={styles.rowPhoto}
              />
            ) : (
              <span className={styles.rowPhoto} />
            )}
            <span className={styles.rowBody}>
              <span className={styles.miniRent}>{pinPrice(pin.rentCents)} a month</span>
              <Link href={`/home/${pin.slug}`} className={styles.miniLink}>
                {pin.title}
              </Link>
              {card ? <span className={styles.miniRooms}>{card.rooms}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
