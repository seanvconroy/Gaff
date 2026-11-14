'use client';

import { Check, Pencil, Undo2, X } from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MAP_UNAVAILABLE,
  drawingNote,
  homesHere,
  mapWords,
  pinPrice,
  shapeProblem,
} from '@/copy/map';
import { cameraKey, clampToIreland, shouldFit, startBox } from '@/domain/map/camera';
import type { MapFailure } from '@/domain/map/counts';
import { canFinish, shapeFromOutline } from '@/domain/map/draw';
import { groupByPoint, groupOf, type MapPin, type PinGroup } from '@/domain/map/points';
import { mapScheme } from '@/domain/map/theme';
import type { BBox, Point } from '@/domain/places/geo';
import { areaPath, baseArea } from '@/domain/search/places';
import { readBBox, searchQuery, writeBBox } from '@/domain/search/url';
import type { MapSettings } from '@/lib/map';
import { countMap, openKind } from '@/ui/map/count';
import { usePageScheme } from '@/ui/map/useScheme';
import { useSearchNavigation } from '../navigation';
import { hrefFor, type ClientSearch } from '../state';
import { CardRow } from './CardRow';
import type { MapCard, MapProviderProps } from './types';
import { StaticMap } from './StaticMap';
import styles from './map.module.css';

// Google's script loads only with this component, and this component only when the map shows.
const GoogleMap = dynamic(() => import('./GoogleMap').then((m) => m.GoogleMap), { ssr: false });

/** Pins load when the map stops moving, 300 ms later; a request still waiting is dropped. */
const POINTS_DELAY_MS = 300;
/** A move searches the map area once the map has been still for this long. */
const SEARCH_DELAY_MS = 600;
/** The page's first photos come first: the map starts once the browser has a quiet moment. */
const IDLE_TIMEOUT_MS = 2000;

/** Runs once the page has loaded and the browser is idle, so the map never competes with it. */
function whenQuiet(run: () => void): () => void {
  let cancelled = false;
  let idle: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const start = () => {
    if (cancelled) return;
    if (typeof window.requestIdleCallback === 'function') {
      idle = window.requestIdleCallback(() => !cancelled && run(), { timeout: IDLE_TIMEOUT_MS });
    } else {
      timer = setTimeout(() => !cancelled && run(), 200);
    }
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener('load', start);
    if (idle !== undefined) window.cancelIdleCallback?.(idle);
    clearTimeout(timer);
  };
}

/**
 * M57, M117, M119, M120, M127, M128, M131: the map beside the list (and on its own on phones).
 * It loads only once it's on screen and the page has settled, so renters' devices don't call
 * Google otherwise. It fits a search's area when the area changes and at no other time; the
 * renter's own moves search the area in view; Draw searches inside an outline, drawn or tapped
 * out corner by corner; a pin opens a mini card. If it can't load, the list carries on and
 * says so.
 */
export function SearchMap({ settings, search }: { settings: MapSettings; search: ClientSearch }) {
  const container = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<'waiting' | 'loading' | 'ready' | 'failed'>('waiting');
  const [pins, setPins] = useState<MapPin[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [corners, setCorners] = useState<Point[]>([]);
  /** Why the last outline couldn't be searched, until the renter draws again. */
  const [problem, setProblem] = useState<string | null>(null);
  const [cards, setCards] = useState<Record<string, MapCard | null>>({});
  const requested = useRef(new Set<string>());
  const { navigate, hovered, setHovered, chosen, setChosen } = useSearchNavigation();
  const pointsRequest = useRef<AbortController | null>(null);
  const timers = useRef<{
    points?: ReturnType<typeof setTimeout>;
    search?: ReturnType<typeof setTimeout>;
  }>({});
  /** The latest search, for handlers that run later than the render that made them. */
  const latest = useRef(search);
  /** The view the map has. */
  const view = useRef<BBox | null>(null);
  /** The map area the renter's last move made: the map is already there (M127). */
  const [renterBox, setRenterBox] = useState<BBox | null>(null);
  /** Whether the map has drawn or failed, so each is acted on once. */
  const outcome = useRef<'ready' | 'failed' | null>(null);

  const pageScheme = usePageScheme();
  const scheme = mapScheme(
    pageScheme,
    settings.provider !== 'google' || Boolean(settings.mapIdDark),
  );
  const groups = useMemo(() => groupByPoint(pins), [pins]);

  useEffect(() => {
    latest.current = search;
  });

  // M119: nothing loads until the map is on screen; M131: and then not before the page's own
  // content. On phones that's when the renter opens the map.
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let cancel = () => {};
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      cancel = whenQuiet(() => {
        setStage('loading');
        countMap('opened', openKind());
      });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancel();
    };
  }, []);

  // M127: the map fits the search's area when the area changes, and at no other time. `fit`
  // is a new object only when a fit is wanted: the providers move the map when it changes.
  const key = cameraKey(search.area);
  const [fit, setFit] = useState(() => ({ id: 0, box: startBox(search.area) }));
  const [fittedKey, setFittedKey] = useState(key);
  if (fittedKey !== key) {
    setFittedKey(key);
    if (shouldFit(fittedKey, search.area, renterBox)) {
      setFit({ id: fit.id + 1, box: startBox(search.area) });
    }
  }

  const path = areaPath(search.area);
  const query = searchQuery(search.area, { ...search.filters, page: 1 });
  const loadPins = useCallback(
    (box: BBox) => {
      clearTimeout(timers.current.points);
      timers.current.points = setTimeout(async () => {
        pointsRequest.current?.abort();
        // Every home is in Ireland: a view zoomed out past it asks for the island.
        const asked = clampToIreland(box);
        if (!asked) {
          setPins([]);
          return;
        }
        const controller = new AbortController();
        pointsRequest.current = controller;
        try {
          const response = await fetch(
            `/api/search/points?path=${encodeURIComponent(path)}${query ? `&${query}` : ''}&view=${writeBBox(asked)}`,
            { signal: controller.signal },
          );
          if (response.ok) setPins(((await response.json()) as { points: MapPin[] }).points);
        } catch {
          // A cancelled request, or the network: the pins stay as they were.
        }
      }, POINTS_DELAY_MS);
    },
    [path, query],
  );

  // A new search (a filter, say) keeps the map where it is: the pins change, not the view.
  useEffect(() => {
    if (view.current) loadPins(view.current);
  }, [loadPins]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      clearTimeout(pending.points);
      clearTimeout(pending.search);
      pointsRequest.current?.abort();
    };
  }, []);

  /** The view changed. The renter's own move searches the area in view (M57, M127). */
  const onMoved = useCallback(
    (box: BBox, byRenter: boolean) => {
      view.current = box;
      loadPins(box);
      if (!byRenter) return;
      clearTimeout(timers.current.search);
      timers.current.search = setTimeout(() => {
        const clamped = clampToIreland(box);
        const asked = clamped ? readBBox(writeBBox(clamped)) : null;
        if (!asked) return;
        const now = latest.current;
        setRenterBox(asked);
        countMap('area_searched');
        navigate(
          hrefFor(
            { ...now, area: { kind: 'map', box: asked, from: baseArea(now.area) } },
            now.filters,
          ),
          { replace: true },
        );
      }, SEARCH_DELAY_MS);
    },
    [loadPins, navigate],
  );

  const stopDrawing = useCallback((words: string | null) => {
    setDrawing(false);
    setCorners([]);
    setProblem(words);
  }, []);

  /** M56, M128: an outline, drawn or tapped out, becomes a shape search. */
  const onDrawn = useCallback(
    (outline: Point[]) => {
      const shape = shapeFromOutline(outline);
      if (!shape.ok) {
        stopDrawing(shapeProblem(shape.problem));
        return;
      }
      stopDrawing(null);
      countMap('shape_drawn');
      const now = latest.current;
      navigate(
        hrefFor(
          {
            ...now,
            area: {
              kind: 'shape',
              polygon: shape.polygon,
              box: shape.box,
              from: baseArea(now.area),
            },
          },
          now.filters,
        ),
      );
    },
    [navigate, stopDrawing],
  );

  const onCorner = useCallback((corner: Point) => {
    setCorners((current) => [...current, corner]);
  }, []);

  /** A home's card (photo, rooms, link), fetched once and kept: for the mini card and the row. */
  const requestCard = useCallback((id: string) => {
    if (requested.current.has(id)) return;
    requested.current.add(id);
    fetch(`/api/search/card?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? (r.json() as Promise<MapCard>) : null))
      .then((body) => setCards((prev) => ({ ...prev, [id]: body })))
      .catch(() => requested.current.delete(id));
  }, []);

  /** A pin was chosen: its home, or the first of the homes that share its point (M117). */
  const onChoose = useCallback(
    (group: PinGroup) => {
      countMap(group.homes.length > 1 ? 'group_opened' : 'pin_opened');
      setChosen(group.homes[0]!.id);
    },
    [setChosen],
  );

  const onReady = useCallback(() => {
    if (outcome.current) return;
    outcome.current = 'ready';
    setStage('ready');
    countMap('shown', openKind());
  }, []);

  /** M120: whatever went wrong, Gaff's own sentence takes the map's place, once. */
  const onFailed = useCallback((kind: MapFailure) => {
    if (outcome.current === 'failed') return;
    outcome.current = 'failed';
    setStage('failed');
    countMap('failed', kind);
  }, []);

  const chosenGroup = groupOf(groups, chosen);
  const alone = chosenGroup?.homes.length === 1 ? chosenGroup.homes[0]! : null;
  useEffect(() => {
    if (alone) requestCard(alone.id);
  }, [alone, requestCard]);
  const card = alone ? (cards[alone.id] ?? null) : null;

  const failed = stage === 'failed';
  const shown = stage === 'loading' || stage === 'ready';
  const providerProps: MapProviderProps = {
    fit,
    groups,
    hovered,
    chosen,
    onHover: setHovered,
    onChoose,
    onMoved,
    drawing,
    corners,
    onCorner,
    onDrawn,
    area: search.area,
    scheme,
    onReady,
    onFailed,
  };
  const shapeOn = search.area.kind === 'shape';
  // M128: while drawing, the note says how, and how far along the corners are.
  const note = drawing ? drawingNote(corners.length) : problem;
  // M137: the outline of a place or street comes from Gaff's place index.
  const placeDrawn = search.area.kind === 'radius' || search.area.kind === 'near';

  return (
    <div
      ref={container}
      className={styles.map}
      data-map-scheme={scheme}
      data-stage={stage}
      data-provider={settings.provider}
    >
      {failed ? (
        <div className={styles.failed} role="status">
          <p>{MAP_UNAVAILABLE}</p>
        </div>
      ) : shown ? (
        <div className={styles.canvas}>
          {settings.provider === 'google' ? (
            <GoogleMap {...providerProps} settings={settings} />
          ) : (
            <StaticMap {...providerProps} />
          )}
        </div>
      ) : null}
      {stage === 'loading' ? (
        <p className="visually-hidden" role="status">
          {mapWords.loading}
        </p>
      ) : null}

      {stage === 'ready' ? (
        <div className={styles.controls}>
          {shapeOn ? (
            <button
              type="button"
              className={styles.control}
              onClick={() => {
                const now = latest.current;
                navigate(hrefFor({ ...now, area: baseArea(now.area) }, now.filters));
              }}
            >
              <X size={18} strokeWidth={2} aria-hidden="true" />
              {mapWords.removeShape}
            </button>
          ) : (
            <div className={styles.controlRow}>
              <button
                type="button"
                className={styles.control}
                aria-pressed={drawing}
                onClick={() => {
                  if (drawing) stopDrawing(null);
                  else {
                    setProblem(null);
                    setDrawing(true);
                  }
                }}
              >
                {drawing ? (
                  <X size={18} strokeWidth={2} aria-hidden="true" />
                ) : (
                  <Pencil size={18} strokeWidth={2} aria-hidden="true" />
                )}
                {drawing ? mapWords.cancelDrawing : mapWords.draw}
              </button>
              {drawing && corners.length > 0 ? (
                <>
                  <button
                    type="button"
                    className={styles.control}
                    onClick={() => setCorners(corners.slice(0, -1))}
                  >
                    <Undo2 size={18} strokeWidth={2} aria-hidden="true" />
                    {mapWords.undo}
                  </button>
                  <button
                    type="button"
                    className={styles.control}
                    disabled={!canFinish(corners.length)}
                    onClick={() => onDrawn(corners)}
                  >
                    <Check size={18} strokeWidth={2} aria-hidden="true" />
                    {mapWords.done}
                  </button>
                </>
              ) : null}
            </div>
          )}
          {note ? (
            <p className={styles.note} role="status">
              {note}
            </p>
          ) : null}
          {placeDrawn ? (
            <p className={styles.placesCredit}>
              <Link href="/map-and-place-data">{mapWords.placesCredit}</Link>
            </p>
          ) : null}
        </div>
      ) : null}

      {stage === 'ready' ? (
        <CardRow
          groups={groups}
          chosen={chosen}
          chosenGroup={chosenGroup}
          onChoose={setChosen}
          cards={cards}
          requestCard={requestCard}
        />
      ) : null}

      {chosenGroup && chosenGroup.homes.length > 1 ? (
        <article
          className={styles.miniCard}
          data-list
          aria-label={homesHere(chosenGroup.homes.length)}
        >
          <div className={styles.miniBody}>
            <h2 className={styles.miniTitle}>{homesHere(chosenGroup.homes.length)}</h2>
            <ul className={styles.miniList}>
              {chosenGroup.homes.map((home) => (
                <li key={home.id}>
                  <Link href={`/home/${home.slug}`} className={styles.miniRow}>
                    <span className={styles.miniRent}>{pinPrice(home.rentCents)} a month</span>
                    <span>{home.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            className={styles.miniClose}
            aria-label={mapWords.close}
            onClick={() => setChosen(null)}
          >
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </article>
      ) : card ? (
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
            aria-label={mapWords.close}
            onClick={() => setChosen(null)}
          >
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </article>
      ) : null}
    </div>
  );
}
