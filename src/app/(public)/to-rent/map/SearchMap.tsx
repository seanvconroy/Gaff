'use client';

import { Pencil, X } from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BBox, Point } from '@/domain/places/geo';
import { polygonAreaKm2, simplify } from '@/domain/places/geo';
import { areaPath, baseArea } from '@/domain/search/places';
import { MAX_SHAPE_KM2, MAX_SHAPE_POINTS, searchQuery } from '@/domain/search/url';
import { useSearchNavigation } from '../navigation';
import { hrefFor, type ClientSearch } from '../state';
import { CardRow } from './CardRow';
import type { MapCard, MapPin, MapProviderProps } from './types';
import { StaticMap } from './StaticMap';
import styles from './map.module.css';

// Google's script loads only with this component, and this component only when the map shows.
const GoogleMap = dynamic(() => import('./GoogleMap').then((m) => m.GoogleMap), { ssr: false });

export interface MapSettings {
  provider: 'google' | 'static';
  apiKey?: string;
  mapId?: string;
  mapIdDark?: string;
}

/** Pins load when the map stops moving, 300 ms later; a request still waiting is dropped. */
const POINTS_DELAY_MS = 300;
/** A move searches the map area once the map has been still for this long. */
const SEARCH_DELAY_MS = 600;

/**
 * M57, M117, M119, M120: the map beside the list (and on its own on phones). It loads only
 * once it's on screen, so renters' devices don't call Google otherwise. Moving it searches the
 * area in view; Draw searches inside an outline; a pin opens a mini card. If it can't load, the
 * list carries on and says so.
 */
export function SearchMap({
  settings,
  search,
  startBox,
}: {
  settings: MapSettings;
  search: ClientSearch;
  /** Where the map starts: the place, the distance around it, or all of Ireland. */
  startBox: BBox;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pins, setPins] = useState<MapPin[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [drawNote, setDrawNote] = useState<string | null>(null);
  const [cards, setCards] = useState<Record<string, MapCard | null>>({});
  const requested = useRef(new Set<string>());
  const { navigate, hovered, setHovered, chosen, setChosen } = useSearchNavigation();
  const pointsRequest = useRef<AbortController | null>(null);
  const timers = useRef<{
    points?: ReturnType<typeof setTimeout>;
    search?: ReturnType<typeof setTimeout>;
  }>({});

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const loadPins = useCallback(
    (view: BBox) => {
      clearTimeout(timers.current.points);
      timers.current.points = setTimeout(async () => {
        pointsRequest.current?.abort();
        const controller = new AbortController();
        pointsRequest.current = controller;
        const query = searchQuery(search.area, { ...search.filters, page: 1 });
        const viewParam = [view.minLng, view.minLat, view.maxLng, view.maxLat]
          .map((n) => n.toFixed(5))
          .join(',');
        try {
          const r = await fetch(
            `/api/search/points?path=${encodeURIComponent(areaPath(search.area))}${query ? `&${query}` : ''}&view=${viewParam}`,
            { signal: controller.signal },
          );
          if (r.ok) setPins(((await r.json()) as { points: MapPin[] }).points);
        } catch {
          // A cancelled request, or the network: the pins stay as they were.
        }
      }, POINTS_DELAY_MS);
    },
    [search.area, search.filters],
  );

  /** The renter moved the map: search the area in view (M57). */
  const onMoved = useCallback(
    (view: BBox, byRenter: boolean) => {
      loadPins(view);
      if (!byRenter) return;
      clearTimeout(timers.current.search);
      timers.current.search = setTimeout(() => {
        const area = { kind: 'map' as const, box: view, from: baseArea(search.area) };
        navigate(hrefFor({ ...search, area }, search.filters), { replace: true });
      }, SEARCH_DELAY_MS);
    },
    [loadPins, navigate, search],
  );

  /** M56: an outline drawn on the map becomes a shape search. */
  const onDrawn = useCallback(
    (outline: Point[]) => {
      setDrawing(false);
      let points = simplify(outline, 25);
      for (let tolerance = 50; points.length > MAX_SHAPE_POINTS; tolerance *= 2) {
        points = simplify(outline, tolerance);
      }
      const area = polygonAreaKm2(points);
      if (points.length < 3 || area === 0) {
        setDrawNote('Draw round the area you want, then let go.');
        return;
      }
      if (area > MAX_SHAPE_KM2) {
        setDrawNote('That area is too big. Draw round a smaller one.');
        return;
      }
      setDrawNote(null);
      const shape = {
        kind: 'shape' as const,
        polygon: points,
        box: {
          minLat: Math.min(...points.map((p) => p.lat)),
          maxLat: Math.max(...points.map((p) => p.lat)),
          minLng: Math.min(...points.map((p) => p.lng)),
          maxLng: Math.max(...points.map((p) => p.lng)),
        },
        from: baseArea(search.area),
      };
      navigate(hrefFor({ ...search, area: shape }, search.filters));
    },
    [navigate, search],
  );

  /** A home's card (photo, rooms, link), fetched once and kept: for the mini card and the row. */
  const requestCard = useCallback((id: string) => {
    if (requested.current.has(id)) return;
    requested.current.add(id);
    fetch(`/api/search/card?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? (r.json() as Promise<MapCard>) : null))
      .then((body) => setCards((prev) => ({ ...prev, [id]: body })))
      .catch(() => requested.current.delete(id));
  }, []);

  useEffect(() => {
    if (chosen) requestCard(chosen);
  }, [chosen, requestCard]);
  const card = chosen ? (cards[chosen] ?? null) : null;

  const providerProps: MapProviderProps = {
    startBox,
    pins,
    hovered,
    chosen,
    onHover: setHovered,
    onChoose: setChosen,
    onMoved,
    drawing,
    onDrawn,
    area: search.area,
    onFailed: () => setFailed(true),
  };

  const shapeOn = search.area.kind === 'shape';
  return (
    <div ref={container} className={styles.map}>
      {failed ? (
        <div className={styles.failed} role="status">
          <p>The map isn’t available right now. Every home is still in the list.</p>
        </div>
      ) : visible ? (
        settings.provider === 'google' && settings.apiKey && settings.mapId ? (
          <GoogleMap
            {...providerProps}
            apiKey={settings.apiKey}
            mapId={settings.mapId}
            mapIdDark={settings.mapIdDark}
          />
        ) : (
          <StaticMap
            key={[startBox.minLat, startBox.minLng, startBox.maxLat, startBox.maxLng].join()}
            {...providerProps}
          />
        )
      ) : null}

      {!failed ? (
        <div className={styles.controls}>
          {shapeOn ? (
            <button
              type="button"
              className={styles.control}
              onClick={() =>
                navigate(hrefFor({ ...search, area: baseArea(search.area) }, search.filters))
              }
            >
              <X size={18} strokeWidth={2} aria-hidden="true" />
              Remove shape
            </button>
          ) : (
            <button
              type="button"
              className={styles.control}
              aria-pressed={drawing}
              onClick={() => {
                setDrawNote(
                  drawing ? null : 'Draw round the area you want with your finger or mouse.',
                );
                setDrawing((d) => !d);
              }}
            >
              <Pencil size={18} strokeWidth={2} aria-hidden="true" />
              {drawing ? 'Cancel drawing' : 'Draw'}
            </button>
          )}
          {drawNote ? (
            <p className={styles.note} role="status">
              {drawNote}
            </p>
          ) : null}
        </div>
      ) : null}

      {!failed && visible ? (
        <CardRow
          pins={pins}
          chosen={chosen}
          onChoose={setChosen}
          cards={cards}
          requestCard={requestCard}
        />
      ) : null}

      {card ? (
        <article className={styles.miniCard} aria-label={`Chosen home: ${card.title}`}>
          {card.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.photo.src}
              srcSet={card.photo.srcSet}
              sizes="160px"
              width={card.photo.width}
              height={card.photo.height}
              alt=""
              className={styles.miniPhoto}
            />
          ) : null}
          <div className={styles.miniBody}>
            <h2 className={styles.miniTitle}>
              <Link href={card.href} className={styles.miniLink}>
                {card.title}
              </Link>
            </h2>
            <p className={styles.miniRent}>{card.rent}</p>
            <p className={styles.miniRooms}>{card.rooms}</p>
          </div>
          <button
            type="button"
            className={styles.miniClose}
            aria-label="Close"
            onClick={() => setChosen(null)}
          >
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </article>
      ) : null}
    </div>
  );
}
