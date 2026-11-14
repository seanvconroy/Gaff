/// <reference types="google.maps" />
'use client';

import { AdvancedMarker, ControlPosition, Map, useMap } from '@vis.gl/react-google-maps';
import { useCallback, useEffect, useState } from 'react';
import { MAP_BOUNDS } from '@/domain/map/camera';
import type { MapFailure } from '@/domain/map/counts';
import { BIG_NUDGE_METRES, NUDGE_METRES, directionOf, nudge } from '@/domain/map/pin';
import type { Scheme } from '@/domain/map/theme';
import type { Point } from '@/domain/places/geo';
import { GoogleLoader, MapWatch, literal, type GoogleSettings } from './GoogleLoader';
import type { PinMapProps } from './PinPicker';
import styles from './map.module.css';

/**
 * M38: the letter's pin on Google's map (the Maps JavaScript API only; ADR-0027). The letter
 * drags the pin, taps the map where the home is, or moves the pin with the arrow keys. No
 * geocoding, places or address service is called: the point is the letter's own.
 */

type Marker = google.maps.marker.AdvancedMarkerElement;

const round6 = (n: number) => Number(n.toFixed(6));

/** Keeps the pin in view when it's moved from outside the map (the keys, the buttons). */
function Follow({ point }: { point: Point }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const bounds = map.getBounds();
    if (bounds && !bounds.contains(point)) map.panTo(point);
  }, [map, point]);
  return null;
}

function Pin({ point, pinLabel, onMove }: Pick<PinMapProps, 'point' | 'pinLabel' | 'onMove'>) {
  const [marker, setMarker] = useState<Marker | null>(null);
  // The arrow keys move the pin itself, before the map can take them to pan.
  useEffect(() => {
    if (!marker) return;
    const keyed = (event: KeyboardEvent) => {
      const direction = directionOf(event.key);
      if (!direction) return;
      event.preventDefault();
      event.stopPropagation();
      onMove(nudge(point, direction, event.shiftKey ? BIG_NUDGE_METRES : NUDGE_METRES));
    };
    marker.addEventListener('keydown', keyed, true);
    return () => marker.removeEventListener('keydown', keyed, true);
  }, [marker, point, onMove]);
  return (
    <AdvancedMarker
      ref={setMarker}
      position={point}
      title={pinLabel}
      draggable
      onDragEnd={(event) => {
        const to = event.latLng;
        if (to) onMove({ lat: round6(to.lat()), lng: round6(to.lng()) });
      }}
    >
      <svg
        className={styles.homePin}
        width="44"
        height="48"
        viewBox="-22 -44 44 48"
        aria-hidden="true"
      >
        <path d="M0 0 C -5 -11 -14 -17 -14 -27 a 14 14 0 1 1 28 0 C 14 -17 5 -11 0 0 Z" />
        <circle cx={0} cy={-27} r={5} />
      </svg>
    </AdvancedMarker>
  );
}

export function GooglePinMap({
  settings,
  scheme,
  point,
  close,
  label,
  pinLabel,
  onMove,
  onFailed,
}: PinMapProps & { settings: GoogleSettings; scheme: Scheme; onFailed: () => void }) {
  const dark = scheme === 'dark' && Boolean(settings.mapIdDark);
  const failed = useCallback((_kind: MapFailure) => onFailed(), [onFailed]);
  const ready = useCallback(() => undefined, []);
  return (
    <GoogleLoader settings={settings} onFailed={failed}>
      <div className={styles.pickerMap} role="group" aria-label={label}>
        <Map
          className={styles.googlePicker}
          mapId={dark ? settings.mapIdDark : settings.mapId}
          colorScheme={dark ? 'DARK' : 'LIGHT'}
          defaultCenter={point}
          defaultZoom={close ? 18 : 15}
          restriction={{ latLngBounds: literal(MAP_BOUNDS), strictBounds: false }}
          gestureHandling="cooperative"
          disableDefaultUI
          cameraControl
          cameraControlOptions={{ position: ControlPosition.RIGHT_TOP }}
          clickableIcons={false}
          keyboardShortcuts
          tilt={0}
          heading={0}
          tiltInteractionEnabled={false}
          headingInteractionEnabled={false}
          onClick={(event) => {
            // A tap on the map puts the pin there (M38): no dragging needed.
            const to = event.detail.latLng;
            if (to) onMove({ lat: round6(to.lat), lng: round6(to.lng) });
          }}
        >
          <MapWatch onReady={ready} onFailed={failed} />
          <Follow point={point} />
          <Pin point={point} pinLabel={pinLabel} onMove={onMove} />
        </Map>
      </div>
    </GoogleLoader>
  );
}
