'use client';

import { Search, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MAP_UNAVAILABLE, homesHere, mapWords, onTheMap, pinPrice } from '@/copy/map';
import { cameraKey, clampToIreland, shouldFit, startBox, type MapArea } from '@/domain/map/camera';
import type { MapEvent, MapFailure } from '@/domain/map/counts';
import { groupByPoint, groupOf, type MapPin, type PinGroup } from '@/domain/map/points';
import { mapScheme } from '@/domain/map/theme';
import type { BBox } from '@/domain/places/geo';
import type { MapSettings } from '@/lib/map';
import { reloading } from './MapBoundary';
import { MapErrorBoundary } from './MapErrorBoundary';
import type { MapProviderProps } from './map-types';
import { StaticMap } from './StaticMap';
import { useMapScheme } from './useMapScheme';
import styles from './SearchMap.module.css';

// Google's script loads only with this component, and this component only when the map shows.
const GoogleSearchMap = dynamic(() => import('./GoogleSearchMap').then((m) => m.GoogleSearchMap), {
  ssr: false,
});

/** Pins load when the map stops moving, 300 ms later; a request still waiting is dropped. */
const POINTS_DELAY_MS = 300;
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

/** What the map asks of the page: the pins in a view, and a home's mini card. */
export interface MapPins {
  points: MapPin[];
  pinned: number;
  listed: number;
}

export interface MapCardData {
  id: string;
  href: string;
  title: string;
  line: string;
  free: string;
  photo: { src: string; alt: string } | null;
}

/**
 * M57, M117, M119, M120, M127, M131: the map of a search's homes. It loads only once it's on
 * screen and the page has settled, so renters' devices don't call Google otherwise. It fits the
 * search's area when the area changes and at no other time; after the renter moves it, "Search
 * this area" searches the homes in view; a pin opens a mini card, and homes at one point share a
 * pin that lists them. If it can't load, for any reason, Gaff's own sentence takes its place and
 * the list carries on (M120).
 */
export function SearchMap({
  settings,
  area,
  loadPins,
  loadCard,
  onSearchArea,
  hovered,
  onHover,
  count,
  openKind,
}: {
  settings: MapSettings;
  area: MapArea;
  /** Must change identity only when the search does: a new one loads the pins again. */
  loadPins: (view: BBox, signal: AbortSignal) => Promise<MapPins | null>;
  loadCard: (id: string) => Promise<MapCardData | null>;
  /** M57: the renter asked for the homes in view. */
  onSearchArea: (box: BBox) => void;
  /** The home a card in the list is pointing at, and the page's way to hear the map's. */
  hovered: string | null;
  onHover: (id: string | null) => void;
  /** M133: one use of the map, as a fixed code. */
  count: (event: MapEvent, kind?: string) => void;
  /** Where the map opened: on its own (below 900px) or beside the list. */
  openKind: () => 'phone' | 'larger';
}) {
  const container = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<'waiting' | 'loading' | 'ready' | 'failed'>('waiting');
  const [answer, setAnswer] = useState<MapPins | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [cards, setCards] = useState<Record<string, MapCardData | null>>({});
  const requested = useRef(new Set<string>());
  const pointsRequest = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** The view the map has. */
  const view = useRef<BBox | null>(null);
  /** M127: the view the renter moved to, until they search it or the area changes. */
  const [moved, setMoved] = useState<BBox | null>(null);
  /** The map area the renter's last "Search this area" made: the map is already there. */
  const [renterBox, setRenterBox] = useState<BBox | null>(null);
  /** Whether the map has drawn or failed, so each is acted on once. */
  const outcome = useRef<'ready' | 'failed' | null>(null);

  const pageScheme = useMapScheme();
  const scheme = mapScheme(
    pageScheme,
    settings.provider !== 'google' || Boolean(settings.mapIdDark),
  );
  const groups = useMemo(() => groupByPoint(answer?.points ?? []), [answer]);

  // M119: nothing loads until the map is on screen; M131: and then not before the page's own
  // content. Below 900px that's when the renter opens the map.
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let cancel = () => {};
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      cancel = whenQuiet(() => {
        // A page swapped in from one without the map loads again first (MapBoundary).
        if (reloading()) return;
        setStage('loading');
        count('opened', openKind());
      });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancel();
    };
  }, [count, openKind]);

  // M127: the map fits the search's area when the area changes, and at no other time. `fit`
  // is a new object only when a fit is wanted: the providers move the map when it changes.
  const key = cameraKey(area);
  const [fit, setFit] = useState(() => ({ id: 0, box: startBox(area) }));
  const [fittedKey, setFittedKey] = useState(key);
  if (fittedKey !== key) {
    setFittedKey(key);
    setMoved(null);
    if (shouldFit(fittedKey, area, renterBox)) setFit({ id: fit.id + 1, box: startBox(area) });
  }

  const pinsIn = useCallback(
    (box: BBox) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        pointsRequest.current?.abort();
        // Every home is in Ireland: a view zoomed out past it asks for the island.
        const asked = clampToIreland(box);
        if (!asked) {
          setAnswer((current) => (current ? { ...current, points: [] } : current));
          return;
        }
        const controller = new AbortController();
        pointsRequest.current = controller;
        try {
          const found = await loadPins(asked, controller.signal);
          if (found) setAnswer(found);
        } catch {
          // A cancelled request, or the network: the pins stay as they were.
        }
      }, POINTS_DELAY_MS);
    },
    [loadPins],
  );

  // A new search (a filter, say) keeps the map where it is: the pins change, not the view.
  useEffect(() => {
    if (view.current) pinsIn(view.current);
  }, [pinsIn]);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      pointsRequest.current?.abort();
    },
    [],
  );

  /** The view changed. The renter's own move offers "Search this area" (M57, M127). */
  const onMoved = useCallback(
    (box: BBox, byRenter: boolean) => {
      view.current = box;
      pinsIn(box);
      if (byRenter) setMoved(box);
    },
    [pinsIn],
  );

  const searchArea = () => {
    const box = moved ? clampToIreland(moved) : null;
    if (!box) return;
    setRenterBox(box);
    setMoved(null);
    count('area_searched');
    onSearchArea(box);
  };

  /** A home's card, fetched once and kept. */
  const requestCard = useCallback(
    (id: string) => {
      if (requested.current.has(id)) return;
      requested.current.add(id);
      loadCard(id)
        .then((card) => setCards((prev) => ({ ...prev, [id]: card })))
        .catch(() => requested.current.delete(id));
    },
    [loadCard],
  );

  /** A pin was chosen: its home, or the first of the homes that share its point (M117). */
  const onChoose = useCallback(
    (group: PinGroup) => {
      count(group.homes.length > 1 ? 'group_opened' : 'pin_opened');
      setChosen(group.homes[0]!.id);
    },
    [count],
  );

  const onReady = useCallback(() => {
    if (outcome.current) return;
    outcome.current = 'ready';
    setStage('ready');
    count('shown', openKind());
  }, [count, openKind]);

  /** M120: whatever went wrong, Gaff's own sentence takes the map's place, once. */
  const onFailed = useCallback(
    (kind: MapFailure) => {
      if (outcome.current === 'failed') return;
      outcome.current = 'failed';
      setStage('failed');
      count('failed', kind);
    },
    [count],
  );
  /** Something inside the map threw: the same sentence, and the list carries on. */
  const onError = useCallback(() => onFailed('error'), [onFailed]);

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
    onHover,
    onChoose,
    onMoved,
    area,
    scheme,
    onReady,
    onFailed,
  };
  const unavailable = (
    <div className={styles.failed} role="status">
      <p>{MAP_UNAVAILABLE}</p>
    </div>
  );

  return (
    <div
      ref={container}
      className={styles.map}
      data-map-scheme={scheme}
      data-stage={stage}
      data-provider={settings.provider}
    >
      <MapErrorBoundary fallback={unavailable} onError={onError}>
        {failed ? (
          unavailable
        ) : shown ? (
          <div className={styles.canvas}>
            {settings.provider === 'google' ? (
              <GoogleSearchMap {...providerProps} settings={settings} />
            ) : (
              <StaticMap {...providerProps} />
            )}
          </div>
        ) : null}
      </MapErrorBoundary>
      {stage === 'loading' ? (
        <p className="visually-hidden" role="status">
          {mapWords.loading}
        </p>
      ) : null}

      {stage === 'ready' ? (
        <div className={styles.controls}>
          {moved ? (
            <button type="button" className={styles.control} onClick={searchArea}>
              <Search size={18} strokeWidth={2} aria-hidden="true" />
              {mapWords.searchThisArea}
            </button>
          ) : null}
          {answer ? (
            <p className={styles.note} role="status">
              {onTheMap(answer.pinned, answer.listed)}
            </p>
          ) : null}
          {/* M137: a street drawn on the map comes from Gaff's place index. */}
          {area.kind === 'near' && area.line ? (
            <p className={styles.placesCredit}>
              <Link href="/map-and-place-data">{mapWords.placesCredit}</Link>
            </p>
          ) : null}
        </div>
      ) : null}

      {stage !== 'ready' ? null : chosenGroup && chosenGroup.homes.length > 1 ? (
        <article className={styles.miniCard} aria-label={homesHere(chosenGroup.homes.length)}>
          <div className={styles.miniBody}>
            <h2 className={styles.miniTitle}>{homesHere(chosenGroup.homes.length)}</h2>
            <ul className={styles.miniList}>
              {chosenGroup.homes.map((home) => (
                <li key={home.id}>
                  <Link href={`/homes/${home.id}`} className={styles.miniRow}>
                    <span>{pinPrice(home.rentCents)} a month</span>
                    <span className={styles.miniLine}>{home.title}</span>
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
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </article>
      ) : card ? (
        <article className={styles.miniCard} aria-label={mapWords.chosen(card.title)}>
          {card.photo ? (
            // A home's own photo, already sized where it is stored.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.photo.src} alt={card.photo.alt} className={styles.miniPhoto} />
          ) : null}
          <div className={styles.miniBody}>
            <h2 className={styles.miniTitle}>
              <Link href={card.href} className={styles.miniLink}>
                {card.title}
              </Link>
            </h2>
            <p className={styles.miniLine}>{card.line}</p>
            <p>{card.free}</p>
          </div>
          <button
            type="button"
            className={styles.miniClose}
            aria-label={mapWords.close}
            onClick={() => setChosen(null)}
          >
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </article>
      ) : null}
    </div>
  );
}
