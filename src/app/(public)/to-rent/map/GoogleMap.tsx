/// <reference types="google.maps" />
'use client';

import { MarkerClusterer, type Renderer } from '@googlemaps/markerclusterer';
import { AdvancedMarker, APIProvider, Map, useMap } from '@vis.gl/react-google-maps';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { BBox, Point } from '@/domain/places/geo';
import { pinLabel, type MapPin, type MapProviderProps } from './types';
import styles from './map.module.css';

/**
 * ADR-0027: Google Maps (the Maps JavaScript API only) for search. Only Gaff's own content goes
 * on it: price pins, clusters, the searched area and drawn shapes. Business markers are off in
 * the Map ID's style; Google's logo and terms are never covered. Loaded only when the map is on
 * screen (SearchMap), so renters' devices don't call Google otherwise (M119).
 */

const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function boxOf(bounds: google.maps.LatLngBounds | undefined): BBox | null {
  if (!bounds) return null;
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  return { minLat: sw.lat(), minLng: sw.lng(), maxLat: ne.lat(), maxLng: ne.lng() };
}

const literal = (box: BBox): google.maps.LatLngBoundsLiteral => ({
  north: box.maxLat,
  south: box.minLat,
  east: box.maxLng,
  west: box.minLng,
});

/** M117: clusters as a navy circle with the count. */
const clusterRenderer: Renderer = {
  render: ({ count, position }) => {
    const el = document.createElement('div');
    el.className = styles.cluster!;
    el.textContent = String(count);
    return new google.maps.marker.AdvancedMarkerElement({
      position,
      content: el,
      title: `${count} homes here: zoom in`,
      zIndex: 1000 + count,
    });
  },
};

function Pins({
  pins,
  hovered,
  chosen,
  onHover,
  onChoose,
}: Pick<MapProviderProps, 'pins' | 'hovered' | 'chosen' | 'onHover' | 'onChoose'>) {
  const map = useMap();
  const [markers, setMarkers] = useState<Record<string, google.maps.marker.AdvancedMarkerElement>>(
    {},
  );
  const clusterer = useMemo(
    () => (map ? new MarkerClusterer({ map, renderer: clusterRenderer }) : null),
    [map],
  );
  useEffect(() => {
    if (!clusterer) return;
    clusterer.clearMarkers();
    // The home being looked at stays out of its cluster, so its pin always shows.
    clusterer.addMarkers(
      Object.entries(markers)
        .filter(([id]) => id !== hovered && id !== chosen)
        .map(([, marker]) => marker),
    );
  }, [clusterer, markers, hovered, chosen]);
  const setRef = useCallback(
    (marker: google.maps.marker.AdvancedMarkerElement | null, id: string) =>
      setMarkers((prev) => {
        if (marker) return prev[id] === marker ? prev : { ...prev, [id]: marker };
        if (!(id in prev)) return prev;
        const { [id]: _gone, ...rest } = prev;
        return rest;
      }),
    [],
  );
  return (
    <>
      {pins.map((pin: MapPin) => {
        const on = pin.id === hovered || pin.id === chosen;
        return (
          <AdvancedMarker
            key={pin.id}
            ref={(marker) => setRef(marker, pin.id)}
            position={{ lat: pin.lat, lng: pin.lng }}
            title={`${pinLabel(pin.rentCents)} a month, ${pin.title}`}
            zIndex={on ? 2000 : undefined}
            onClick={() => onChoose(pin.id)}
            onMouseEnter={() => onHover(pin.id)}
            onMouseLeave={() => onHover(null)}
          >
            <span className={styles.pin} data-on={on || undefined}>
              {pinLabel(pin.rentCents)}
            </span>
          </AdvancedMarker>
        );
      })}
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

/** Follows the page's own moves (a new search) and tells them apart from the renter's. */
function Camera({ startBox, onMoved }: Pick<MapProviderProps, 'startBox' | 'onMoved'>) {
  const map = useMap();
  const pageMove = useRef(true);
  useEffect(() => {
    if (!map) return;
    pageMove.current = true;
    map.fitBounds(literal(startBox));
  }, [map, startBox]);
  useEffect(() => {
    if (!map) return;
    const listeners = [
      map.addListener('dragstart', () => (pageMove.current = false)),
      map.addListener('idle', () => {
        const box = boxOf(map.getBounds());
        if (box) onMoved(box, !pageMove.current);
        pageMove.current = false;
      }),
    ];
    return () => listeners.forEach((l) => l.remove());
  }, [map, onMoved]);
  return null;
}

/** M56: draw an outline with a finger or mouse; the map holds still meanwhile. */
function DrawLayer({ onDrawn }: Pick<MapProviderProps, 'onDrawn'>) {
  const map = useMap();
  const [outline, setOutline] = useState<Array<{ x: number; y: number }>>([]);
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    map?.setOptions({ gestureHandling: 'none' });
    return () => map?.setOptions({ gestureHandling: 'greedy' });
  }, [map]);
  const at = (event: PointerEvent<HTMLDivElement>) => {
    const rect = layer.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const toPoint = ({ x, y }: { x: number; y: number }): Point | null => {
    const projection = map?.getProjection();
    const bounds = map?.getBounds();
    const zoom = map?.getZoom();
    if (!projection || !bounds || zoom === undefined) return null;
    const topRight = projection.fromLatLngToPoint(bounds.getNorthEast())!;
    const bottomLeft = projection.fromLatLngToPoint(bounds.getSouthWest())!;
    const scale = 2 ** zoom;
    const latLng = projection.fromPointToLatLng(
      new google.maps.Point(x / scale + bottomLeft.x, y / scale + topRight.y),
    );
    return latLng ? { lat: latLng.lat(), lng: latLng.lng() } : null;
  };
  return (
    <div
      ref={layer}
      className={styles.drawLayer}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setOutline([at(event)]);
      }}
      onPointerMove={(event) => {
        if (outline.length) setOutline((o) => [...o, at(event)]);
      }}
      onPointerUp={() => {
        const points = outline.map(toPoint).filter((p): p is Point => p !== null);
        setOutline([]);
        onDrawn(points);
      }}
    >
      <svg className={styles.drawSvg} aria-hidden="true">
        <polyline points={outline.map((p) => `${p.x},${p.y}`).join(' ')} className={styles.drawn} />
      </svg>
    </div>
  );
}

export function GoogleMap({
  apiKey,
  mapId,
  mapIdDark,
  ...props
}: MapProviderProps & { apiKey: string; mapId: string; mapIdDark?: string }) {
  const dark =
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return (
    <APIProvider apiKey={apiKey} onError={props.onFailed} language="en" region="IE">
      <Map
        className={styles.googleMap}
        mapId={dark && mapIdDark ? mapIdDark : mapId}
        defaultBounds={literal(props.startBox)}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        clickableIcons={false}
        keyboardShortcuts
        reuseMaps
      >
        <Camera startBox={props.startBox} onMoved={props.onMoved} />
        <AreaOutline area={props.area} />
        <Pins
          pins={props.pins}
          hovered={props.hovered}
          chosen={props.chosen}
          onHover={props.onHover}
          onChoose={props.onChoose}
        />
        {props.drawing ? <DrawLayer onDrawn={props.onDrawn} /> : null}
      </Map>
    </APIProvider>
  );
}
