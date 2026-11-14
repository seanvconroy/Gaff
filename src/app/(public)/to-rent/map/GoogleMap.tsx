/// <reference types="google.maps" />
'use client';

import { MarkerClusterer, SuperClusterAlgorithm, type Renderer } from '@googlemaps/markerclusterer';
import { AdvancedMarker, ControlPosition, Map, useMap } from '@vis.gl/react-google-maps';
import { memo, useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { clusterName, pinLabel, pinName } from '@/copy/map';
import { MAP_BOUNDS } from '@/domain/map/camera';
import { closesShape, isTap, type Press } from '@/domain/map/draw';
import { movedByRenter } from '@/domain/map/gestures';
import { groupOf, type PinGroup } from '@/domain/map/points';
import type { BBox, Point } from '@/domain/places/geo';
import { GoogleLoader, MapWatch, literal, type GoogleSettings } from '@/ui/map/GoogleLoader';
import type { MapProviderProps } from './types';
import styles from './map.module.css';

/**
 * ADR-0027: Google Maps (the Maps JavaScript API only) for search. Only Gaff's own content goes
 * on it: price pins, clusters, the searched area and drawn shapes. Business markers are off in
 * the Map ID's style; Google's logo and terms are never covered. Loaded only when the map is on
 * screen (SearchMap), so renters' devices don't call Google otherwise (M119).
 */

type Marker = google.maps.marker.AdvancedMarkerElement;

const FIT_PADDING = 24;

const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function boxOf(bounds: google.maps.LatLngBounds | undefined): BBox | null {
  if (!bounds) return null;
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  return { minLat: sw.lat(), minLng: sw.lng(), maxLat: ne.lat(), maxLng: ne.lng() };
}

/** How many homes each pin stands for, so a cluster counts homes, not pins (M117). */
const homesOn = new WeakMap<object, number>();

/** M117: a cluster is a ring with the number of homes in it. */
const clusterRenderer: Renderer = {
  render: ({ markers, position }) => {
    const homes = (markers ?? []).reduce((total, marker) => total + (homesOn.get(marker) ?? 1), 0);
    const element = document.createElement('div');
    element.className = styles.cluster!;
    element.textContent = String(homes);
    return new google.maps.marker.AdvancedMarkerElement({
      position,
      content: element,
      title: clusterName(homes),
      zIndex: 1000 + homes,
    });
  },
};

interface PinProps {
  group: PinGroup;
  on: boolean;
  onHover: (homeId: string | null) => void;
  onChoose: (group: PinGroup) => void;
  setMarker: (key: string, marker: Marker | null) => void;
}

/** One pin. Memoised, so pointing at a home redraws its pin and no other. */
const Pin = memo(function Pin({ group, on, onHover, onChoose, setMarker }: PinProps) {
  const first = group.homes[0]!.id;
  const [marker, setOwn] = useState<Marker | null>(null);
  const ref = useCallback(
    (instance: Marker | null) => {
      setOwn(instance);
      setMarker(group.key, instance);
    },
    [group.key, setMarker],
  );
  // The keyboard lights up a home's card as the mouse does (M117).
  useEffect(() => {
    if (!marker) return;
    homesOn.set(marker, group.homes.length);
    const focus = () => onHover(first);
    const blur = () => onHover(null);
    marker.addEventListener('focusin', focus);
    marker.addEventListener('focusout', blur);
    return () => {
      marker.removeEventListener('focusin', focus);
      marker.removeEventListener('focusout', blur);
    };
  }, [marker, group.homes.length, first, onHover]);
  return (
    <AdvancedMarker
      ref={ref}
      position={{ lat: group.lat, lng: group.lng }}
      title={pinName(group)}
      zIndex={on ? 2000 : undefined}
      onClick={() => onChoose(group)}
      onMouseEnter={() => onHover(first)}
      onMouseLeave={() => onHover(null)}
    >
      <span
        className={styles.pin}
        data-on={on || undefined}
        data-homes={group.homes.length > 1 ? group.homes.length : undefined}
      >
        {pinLabel(group)}
      </span>
    </AdvancedMarker>
  );
});

function Pins({
  groups,
  hovered,
  chosen,
  onHover,
  onChoose,
}: Pick<MapProviderProps, 'groups' | 'hovered' | 'chosen' | 'onHover' | 'onChoose'>) {
  const map = useMap();
  const [markers, setMarkers] = useState<Record<string, Marker>>({});
  const clusterer = useRef<MarkerClusterer | null>(null);
  /** Counts the clusterer's passes, so the pin above a cluster is worked out afresh. */
  const [, setPass] = useState(0);

  // One clusterer for each map, taken away with it: a map kept for the next search starts clean.
  useEffect(() => {
    if (!map) return;
    const made = new MarkerClusterer({
      map,
      renderer: clusterRenderer,
      // Pins are pills about 80px wide, so homes closer than that on screen share a cluster
      // (the radius is in the units of a 512px tile: twice the pixels on Google's 256px ones).
      // Past zoom 17 every pin shows on its own; homes at one point already share a pin.
      algorithm: new SuperClusterAlgorithm({ radius: 150, maxZoom: 17 }),
    });
    const listener = google.maps.event.addListener(made, 'clusteringend', () =>
      setPass((pass) => pass + 1),
    );
    clusterer.current = made;
    return () => {
      listener.remove();
      made.clearMarkers(true);
      made.setMap(null);
      clusterer.current = null;
    };
  }, [map]);

  // The clusters change only when the pins do: never because a home is pointed at.
  useEffect(() => {
    if (!map || !clusterer.current) return;
    clusterer.current.clearMarkers(true);
    clusterer.current.addMarkers(Object.values(markers));
  }, [map, markers]);

  const setMarker = useCallback(
    (key: string, marker: Marker | null) =>
      setMarkers((current) => {
        if (marker) return current[key] === marker ? current : { ...current, [key]: marker };
        if (!(key in current)) return current;
        const { [key]: _gone, ...rest } = current;
        return rest;
      }),
    [],
  );

  const lit = [groupOf(groups, chosen), groupOf(groups, hovered)].filter(
    (group, i, all): group is PinGroup => group !== null && all.indexOf(group) === i,
  );
  // A pin inside a cluster is off the map: the home being looked at shows above its cluster.
  const raised = lit.filter((group) => markers[group.key] && !markers[group.key]!.map);
  return (
    <>
      {groups.map((group) => (
        <Pin
          key={group.key}
          group={group}
          on={lit.includes(group)}
          onHover={onHover}
          onChoose={onChoose}
          setMarker={setMarker}
        />
      ))}
      {raised.map((group) => (
        <AdvancedMarker
          key={`raised-${group.key}`}
          position={{ lat: group.lat, lng: group.lng }}
          zIndex={3000}
          clickable={false}
        >
          <span className={styles.pin} data-on data-raised aria-hidden="true">
            {pinLabel(group)}
          </span>
        </AdvancedMarker>
      ))}
    </>
  );
}

/** The searched area: a circle, the street, or the drawn shape, in the Atlantic accent. */
function AreaOutline({ area }: Pick<MapProviderProps, 'area'>) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const stroke = token('--color-atlantic') || undefined;
    const shapes: Array<{ setMap: (m: google.maps.Map | null) => void }> = [];
    const style = { strokeColor: stroke, strokeWeight: 2, fillOpacity: 0, clickable: false };
    if (area.kind === 'radius') {
      shapes.push(
        new google.maps.Circle({ ...style, map, center: area.centre, radius: area.radiusMetres }),
      );
    } else if (area.kind === 'near') {
      shapes.push(
        new google.maps.Circle({
          ...style,
          map,
          center: area.place.centre,
          radius: area.withinKm * 1000,
        }),
      );
      for (const run of area.place.line ?? []) {
        shapes.push(new google.maps.Polyline({ ...style, strokeWeight: 4, map, path: run }));
      }
    } else if (area.kind === 'shape') {
      shapes.push(new google.maps.Polygon({ ...style, map, paths: area.polygon }));
    }
    return () => shapes.forEach((s) => s.setMap(null));
  }, [map, area]);
  return null;
}

/**
 * M127: fits the map when the page asks, and tells the page of every move with whose it was.
 * The renter's moves are the ones they made with a finger, mouse or key on the map; the page's
 * fits and changes of the map's size are not.
 */
function Camera({ fit, onMoved }: Pick<MapProviderProps, 'fit' | 'onMoved'>) {
  const map = useMap();
  const gestureAt = useRef<number | null>(null);
  const pageMoveAt = useRef<number | null>(null);

  // Only a new fit moves the map: `fit.id` changes when the page asks for one, and never
  // because the search changed in some other way.
  const { id, box } = fit;
  const asked = useRef(box);
  useEffect(() => {
    asked.current = box;
  }, [box]);
  useEffect(() => {
    if (!map) return;
    pageMoveAt.current = performance.now();
    map.fitBounds(literal(asked.current), FIT_PADDING);
  }, [map, id]);

  useEffect(() => {
    if (!map) return;
    const element = map.getDiv();
    const touched = () => {
      gestureAt.current = performance.now();
    };
    // A mouse only moves the map while a button is down; a finger or pen is always touching it.
    const pointerMoved = (event: globalThis.PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.buttons !== 0) touched();
    };
    const options = { capture: true, passive: true } as const;
    element.addEventListener('pointerdown', touched, options);
    element.addEventListener('pointermove', pointerMoved, options);
    element.addEventListener('wheel', touched, options);
    element.addEventListener('keydown', touched, options);
    const resized = new ResizeObserver(() => {
      pageMoveAt.current = performance.now();
    });
    resized.observe(element);
    const listeners = [
      map.addListener('dragstart', touched),
      map.addListener('drag', touched),
      map.addListener('dragend', touched),
      map.addListener('idle', () => {
        const box = boxOf(map.getBounds());
        if (!box) return;
        onMoved(
          box,
          movedByRenter({
            gestureAt: gestureAt.current,
            pageMoveAt: pageMoveAt.current,
            settledAt: performance.now(),
          }),
        );
      }),
    ];
    return () => {
      element.removeEventListener('pointerdown', touched, options);
      element.removeEventListener('pointermove', pointerMoved, options);
      element.removeEventListener('wheel', touched, options);
      element.removeEventListener('keydown', touched, options);
      resized.disconnect();
      listeners.forEach((listener) => listener.remove());
    };
  }, [map, onMoved]);
  return null;
}

/**
 * M56, M128: draw an outline with a finger or mouse, or tap its corners; the map holds still
 * meanwhile. Screen points become places through the map's own projection, so they're right at
 * any zoom.
 */
function DrawLayer({
  corners,
  onCorner,
  onDrawn,
}: Pick<MapProviderProps, 'corners' | 'onCorner' | 'onDrawn'>) {
  const map = useMap();
  const [overlay, setOverlay] = useState<google.maps.OverlayView | null>(null);
  const [outline, setOutline] = useState<Array<{ x: number; y: number }>>([]);
  const layer = useRef<HTMLDivElement>(null);
  const press = useRef<Press | null>(null);

  useEffect(() => {
    if (!map) return;
    map.setOptions({ gestureHandling: 'none', keyboardShortcuts: false });
    // An overlay with nothing in it: it's here for the map's projection.
    const view = new google.maps.OverlayView();
    view.onAdd = () => setOverlay(view);
    view.draw = () => undefined;
    view.onRemove = () => undefined;
    view.setMap(map);
    return () => {
      view.setMap(null);
      setOverlay(null);
      map.setOptions({ gestureHandling: 'greedy', keyboardShortcuts: true });
    };
  }, [map]);

  const where = (event: PointerEvent<HTMLDivElement>) => {
    const rect = layer.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const projection = overlay?.getProjection();
  const toPoint = ({ x, y }: { x: number; y: number }): Point | null => {
    const place = projection?.fromContainerPixelToLatLng(new google.maps.Point(x, y));
    return place ? { lat: place.lat(), lng: place.lng() } : null;
  };
  const toScreen = (point: Point) => {
    const pixel = projection?.fromLatLngToContainerPixel(new google.maps.LatLng(point));
    return pixel ? { x: pixel.x, y: pixel.y } : null;
  };
  const cornersOnScreen = corners
    .map(toScreen)
    .filter((p): p is { x: number; y: number } => p !== null);

  return (
    <div
      ref={layer}
      className={styles.drawLayer}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        const at = where(event);
        press.current = { ...at, at: event.timeStamp };
        setOutline([at]);
      }}
      onPointerMove={(event) => {
        if (press.current) setOutline((points) => [...points, where(event)]);
      }}
      onPointerUp={(event) => {
        const down = press.current;
        if (!down) return;
        press.current = null;
        const at = where(event);
        const drawn = outline;
        setOutline([]);
        if (!isTap(down, { ...at, at: event.timeStamp })) {
          onDrawn(drawn.map(toPoint).filter((p): p is Point => p !== null));
          return;
        }
        const first = cornersOnScreen[0];
        if (first && closesShape(corners.length, first, at)) {
          onDrawn(corners);
          return;
        }
        const corner = toPoint(at);
        if (corner) onCorner(corner);
      }}
    >
      <svg className={styles.drawSvg} aria-hidden="true">
        {outline.length > 1 ? (
          <polyline
            points={outline.map((p) => `${p.x},${p.y}`).join(' ')}
            className={styles.drawn}
          />
        ) : null}
        {cornersOnScreen.length > 0 ? (
          <polyline
            points={cornersOnScreen.map((p) => `${p.x},${p.y}`).join(' ')}
            className={styles.drawn}
          />
        ) : null}
        {cornersOnScreen.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === 0 ? 8 : 5} className={styles.corner} />
        ))}
      </svg>
    </div>
  );
}

export function GoogleMap({ settings, ...props }: MapProviderProps & { settings: GoogleSettings }) {
  const dark = props.scheme === 'dark' && Boolean(settings.mapIdDark);
  return (
    <GoogleLoader settings={settings} onFailed={props.onFailed}>
      <Map
        className={styles.googleMap}
        mapId={dark ? settings.mapIdDark : settings.mapId}
        colorScheme={dark ? 'DARK' : 'LIGHT'}
        defaultBounds={{ ...literal(props.fit.box), padding: FIT_PADDING }}
        restriction={{ latLngBounds: literal(MAP_BOUNDS), strictBounds: false }}
        gestureHandling="greedy"
        disableDefaultUI
        // M128: pan and zoom buttons, so the map moves without dragging.
        cameraControl
        cameraControlOptions={{ position: ControlPosition.RIGHT_TOP }}
        clickableIcons={false}
        keyboardShortcuts
        // Flat and north up, so an outline drawn on the screen is the outline searched.
        tilt={0}
        heading={0}
        tiltInteractionEnabled={false}
        headingInteractionEnabled={false}
        reuseMaps
      >
        <MapWatch onReady={props.onReady} onFailed={props.onFailed} />
        <Camera fit={props.fit} onMoved={props.onMoved} />
        <AreaOutline area={props.area} />
        <Pins
          groups={props.groups}
          hovered={props.hovered}
          chosen={props.chosen}
          onHover={props.onHover}
          onChoose={props.onChoose}
        />
        {props.drawing ? (
          <DrawLayer corners={props.corners} onCorner={props.onCorner} onDrawn={props.onDrawn} />
        ) : null}
      </Map>
    </GoogleLoader>
  );
}
