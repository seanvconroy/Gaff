'use client';

import { Check, Pencil, SquarePen, Trash2, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MAP_UNAVAILABLE, homesHere, mapWords, onTheMap, pinPrice } from '@/copy/map';
import { cameraKey, clampToIreland, shouldFit, startBox, type MapArea } from '@/domain/map/camera';
import { placeCard } from '@/domain/map/card-place';
import type { MapEvent, MapFailure } from '@/domain/map/counts';
import { groupByPoint, groupOf, type MapPin, type PinGroup } from '@/domain/map/points';
import { MAX_SHAPES, sameShapes, type Shape } from '@/domain/search/shapes';
import { mapScheme } from '@/domain/map/theme';
import type { BBox } from '@/domain/places/geo';
import type { MapSettings } from '@/lib/map';
import { type CardPhoto, CardPhotos } from './CardPhotos';
import { reloading } from './MapBoundary';
import { MapDraw, type MapDrawHandle } from './MapDraw';
import { MapErrorBoundary } from './MapErrorBoundary';
import type { MapProjection, MapProviderProps } from './map-types';
import { StaticMap } from './StaticMap';
import { useMapScheme } from './useMapScheme';
import styles from './SearchMap.module.css';

// Google's script loads only with this component, and this component only when the map shows.
const GoogleSearchMap = dynamic(() => import('./GoogleSearchMap').then((m) => m.GoogleSearchMap), {
  ssr: false,
});

/** Pins load when the map stops moving, 300 ms later; a request still waiting is dropped. */
const POINTS_DELAY_MS = 300;
/** The list follows the map a moment after it comes to rest, so a second nudge is one search. */
const AREA_DELAY_MS = 450;
const NO_SHAPES: Shape[] = [];
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
  /** The home's first photos, the cover first, to look through on the card (UX-SR-6). */
  photos: CardPhoto[];
}

/**
 * M57, M117, M119, M120, M127, M131: the map of a search's homes. It loads only once it's on
 * screen and the page has settled, so renters' devices don't call Google otherwise. It fits the
 * search's area when the area changes and at no other time. When the renter moves it, the search
 * follows: the list shows the homes in view (Q60). A pin opens its home's card, with the home's
 * photos to look through, and homes at one point share a pin that lists them. Below 900px the
 * card is at the foot of the map; above, it sits beside its pin, whole inside the map
 * (`placeCard`), and moves with it. If the map can't load, for any reason, Gaff's own sentence
 * takes its place and the list carries on (M120).
 *
 * UX-SR-13: "Draw" lets the renter draw up to five areas to search instead, and reshape each by
 * its corners (`MapDraw`). While there are drawn areas, moving the map looks around and doesn't
 * change the search.
 */
export function SearchMap({
  settings,
  area,
  loadPins,
  loadCard,
  onSearchArea,
  onShapes,
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
  /** M57, Q60: the renter moved the map: the search is the homes in view. */
  onSearchArea: (box: BBox) => void;
  /** UX-SR-13: the renter drew, reshaped or removed an area: the search is these areas. */
  onShapes: (shapes: Shape[]) => void;
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
  const areaTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** The map area the renter's last move made: the map is already there. */
  const [renterBox, setRenterBox] = useState<BBox | null>(null);
  /** UX-SR-13: the drawn areas, as they are on this map: the search's own, then the renter's. */
  const urlShapes = area.kind === 'shapes' ? area.shapes : NO_SHAPES;
  const [shapes, setShapes] = useState<Shape[]>(urlShapes);
  /** The area that shows its corners, to reshape. */
  const [selected, setSelected] = useState<number | null>(null);
  const [drawing, setDrawing] = useState(false);
  /** Corners tapped so far while drawing: three or more can be finished. */
  const [taps, setTaps] = useState(0);
  const [tooSmall, setTooSmall] = useState(false);
  const [projection, setProjection] = useState<MapProjection | null>(null);
  const draw = useRef<MapDrawHandle>(null);
  /** What a move of the map may do, read as the map comes to rest. */
  const follows = useRef(true);
  useEffect(() => {
    follows.current = shapes.length === 0 && !drawing;
  }, [shapes, drawing]);
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
  /** The fit the map last had from the page, as a move of the renter's comes to rest. */
  const fitId = useRef(fit.id);
  useEffect(() => {
    fitId.current = fit.id;
  }, [fit.id]);
  if (fittedKey !== key) {
    setFittedKey(key);
    // The search's drawn areas changed from outside this map (Back, a chip removed, a saved
    // search opened): the map shows the search's.
    if (!sameShapes(urlShapes, shapes)) {
      setShapes(urlShapes);
      setSelected(null);
      setDrawing(false);
    }
    if (shouldFit(fittedKey, area, renterBox, shapes)) {
      setFit({ id: fit.id + 1, box: startBox(area) });
    }
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
      clearTimeout(areaTimer.current);
      pointsRequest.current?.abort();
    },
    [],
  );

  /** The search becomes the homes in this view (M57, Q60). */
  const searchArea = useCallback(
    (view: BBox) => {
      const box = clampToIreland(view);
      if (!box) return;
      setRenterBox(box);
      count('area_searched');
      onSearchArea(box);
    },
    [count, onSearchArea],
  );

  /**
   * The view changed. When the renter moved it, the search follows (M127 says whose move it
   * was), unless they have drawn areas: then the map only looks around.
   */
  const onMoved = useCallback(
    (box: BBox, byRenter: boolean) => {
      view.current = box;
      pinsIn(box);
      if (!byRenter || !follows.current) return;
      // The search is the view the map has when the moment is up: a change of size meanwhile
      // (a scrollbar coming or going as the list changes) doesn't lose the renter's move. Only
      // the page fitting the map to a new search does: then the search is that one.
      clearTimeout(areaTimer.current);
      const fitted = fitId.current;
      areaTimer.current = setTimeout(() => {
        if (follows.current && fitId.current === fitted && view.current) {
          searchArea(view.current);
        }
      }, AREA_DELAY_MS);
    },
    [pinsIn, searchArea],
  );

  /** UX-SR-13: the drawn areas changed by the renter's hand: the search is these, at once. */
  const changeShapes = (next: Shape[], event: MapEvent) => {
    clearTimeout(areaTimer.current);
    setShapes(next);
    count(event);
    if (next.length > 0) onShapes(next);
    // With the last one gone, the search is what the map shows, as if they had moved it there.
    else if (view.current) searchArea(view.current);
  };
  const startDrawing = () => {
    clearTimeout(areaTimer.current);
    setChosen(null);
    setSelected(null);
    setTooSmall(false);
    setTaps(0);
    setDrawing(true);
  };
  const removeShape = (index: number) => {
    setSelected(null);
    changeShapes(
      shapes.filter((_, i) => i !== index),
      'area_removed',
    );
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

  /**
   * M117: at 900px and up the open card sits beside its pin, wherever the map has it now. Its
   * place is set here, after each draw, from the card's own size: below 900px, or on a map too
   * small to hold it, the stylesheet's place at the foot stands.
   */
  const cardBox = useRef<HTMLElement>(null);
  const pinLat = chosenGroup?.lat;
  const pinLng = chosenGroup?.lng;
  useLayoutEffect(() => {
    const element = cardBox.current;
    const box = container.current;
    if (!element || !box) return;
    const place =
      projection &&
      pinLat !== undefined &&
      pinLng !== undefined &&
      window.matchMedia('(width > 900px)').matches
        ? placeCard(
            projection.toPixel({ lat: pinLat, lng: pinLng }),
            { width: box.clientWidth, height: box.clientHeight },
            { width: element.offsetWidth, height: element.offsetHeight },
          )
        : null;
    if (place) {
      element.style.left = `${place.left}px`;
      element.style.top = `${place.top}px`;
      element.dataset.placed = place.side;
    } else {
      element.style.removeProperty('left');
      element.style.removeProperty('top');
      delete element.dataset.placed;
    }
  });

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
    onProjection: setProjection,
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
        {stage === 'ready' ? (
          <MapDraw
            ref={draw}
            projection={projection}
            shapes={shapes}
            selected={selected}
            drawing={drawing}
            words={{
              surface: mapWords.drawSurface,
              shape: mapWords.shape,
              corner: mapWords.corner,
              addCorner: mapWords.addCorner,
            }}
            onDrawn={(shape) => {
              setDrawing(false);
              setTooSmall(false);
              setSelected(shapes.length);
              changeShapes([...shapes, shape], 'area_drawn');
            }}
            onTooSmall={() => setTooSmall(true)}
            onCancel={() => setDrawing(false)}
            onTaps={setTaps}
            onReshape={(index, shape) =>
              changeShapes(
                shapes.map((each, i) => (i === index ? shape : each)),
                'area_reshaped',
              )
            }
            onSelect={setSelected}
          />
        ) : null}
      </MapErrorBoundary>
      {stage === 'loading' ? (
        <p className="visually-hidden" role="status">
          {mapWords.loading}
        </p>
      ) : null}

      {stage === 'ready' ? (
        <div className={styles.controls}>
          <div className={styles.tools}>
            {drawing ? (
              <>
                {taps >= 3 ? (
                  <button
                    type="button"
                    className={styles.control}
                    onClick={() => draw.current?.finish()}
                  >
                    <Check size={18} strokeWidth={2} aria-hidden="true" />
                    {mapWords.finish}
                  </button>
                ) : null}
                <button type="button" className={styles.control} onClick={() => setDrawing(false)}>
                  <X size={18} strokeWidth={2} aria-hidden="true" />
                  {mapWords.cancel}
                </button>
              </>
            ) : (
              <>
                {shapes.length < MAX_SHAPES ? (
                  <button
                    type="button"
                    className={styles.control}
                    aria-label={shapes.length === 0 ? undefined : mapWords.drawAnother}
                    onClick={startDrawing}
                  >
                    <Pencil size={18} strokeWidth={2} aria-hidden="true" />
                    {mapWords.draw}
                  </button>
                ) : null}
                {shapes.length > 0 && selected === null ? (
                  <button
                    type="button"
                    className={styles.control}
                    onClick={() => setSelected(shapes.length - 1)}
                  >
                    <SquarePen size={18} strokeWidth={2} aria-hidden="true" />
                    {mapWords.edit}
                  </button>
                ) : null}
                {selected !== null ? (
                  <>
                    <button
                      type="button"
                      className={styles.control}
                      onClick={() => setSelected(null)}
                    >
                      <Check size={18} strokeWidth={2} aria-hidden="true" />
                      {mapWords.done}
                    </button>
                    <button
                      type="button"
                      className={`${styles.control} ${styles.iconControl}`}
                      aria-label={mapWords.remove}
                      title={mapWords.remove}
                      onClick={() => removeShape(selected)}
                    >
                      <Trash2 size={18} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </>
                ) : shapes.length > 0 ? (
                  <button
                    type="button"
                    className={styles.control}
                    onClick={() => changeShapes([], 'area_removed')}
                  >
                    <Trash2 size={18} strokeWidth={2} aria-hidden="true" />
                    {mapWords.clear}
                  </button>
                ) : null}
              </>
            )}
          </div>
          {drawing || selected !== null ? (
            <p className={styles.note} role="status">
              {drawing ? (tooSmall ? mapWords.drawTooSmall : mapWords.drawHint) : mapWords.editHint}
            </p>
          ) : null}
          {answer && !drawing && selected === null ? (
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

      {stage !== 'ready' || drawing ? null : chosenGroup && chosenGroup.homes.length > 1 ? (
        <article
          ref={cardBox}
          className={styles.miniCard}
          aria-label={homesHere(chosenGroup.homes.length)}
        >
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
            <span className={styles.miniCloseDisc}>
              <X size={20} strokeWidth={2} aria-hidden="true" />
            </span>
          </button>
        </article>
      ) : card ? (
        <article
          // A new home is a new card: its photos start again at the cover.
          key={card.id}
          ref={cardBox}
          className={styles.miniCard}
          aria-label={mapWords.chosen(card.title)}
        >
          {card.photos.length > 0 ? (
            <div className={styles.miniPhoto}>
              <div className={styles.miniPhotoFill}>
                {card.photos.length > 1 ? (
                  <CardPhotos href={card.href} photos={card.photos} label={card.line} />
                ) : (
                  // A home's own photo, already sized where it is stored. The card says the
                  // home in words beside it, so the picture adds none.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card.photos[0]!.src} alt="" className={styles.miniImage} />
                )}
              </div>
            </div>
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
            <span className={styles.miniCloseDisc}>
              <X size={20} strokeWidth={2} aria-hidden="true" />
            </span>
          </button>
        </article>
      ) : null}
    </div>
  );
}
