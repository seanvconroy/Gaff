'use client';

import { Minus, Plus } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { mapWords } from '@/copy/map';
import { BIG_NUDGE_METRES, NUDGE_METRES, directionOf, nudge } from '@/domain/map/pin';
import { mapScheme } from '@/domain/map/theme';
import type { Point } from '@/domain/places/geo';
import type { MapSettings } from '@/lib/map';
import { usePageScheme } from './useScheme';
import styles from './map.module.css';

/**
 * M38: a map with one pin that can be moved: dragged, put where the map is tapped, or nudged
 * with the arrow keys. Google's map where it's set up; otherwise the stand-in, which draws the
 * streets around the pin from Gaff's own place index, so a pin can still be placed by eye.
 */

export interface PickerStreet {
  name: string;
  line: Point[][];
}

export interface PinMapProps {
  point: Point;
  /** Open close in (a pin that's placed, or a street that was found), or out at the area. */
  close: boolean;
  streets: PickerStreet[];
  label: string;
  pinLabel: string;
  /** The element that explains the keys, for the pin's description. */
  describedBy?: string;
  onMove: (point: Point) => void;
}

const GooglePinMap = dynamic(() => import('./GooglePinMap').then((m) => m.GooglePinMap), {
  ssr: false,
});

/** Degrees of latitude to a pixel: about 0.8 metres close in, and 5 metres at an area. */
const CLOSE = 0.8 / 111_320;
const FAR = 5 / 111_320;

interface Size {
  w: number;
  h: number;
}
interface Camera {
  lat: number;
  lng: number;
  scale: number;
}
const cosAt = (lat: number) => Math.cos((lat * Math.PI) / 180);

function StaticPinMap({
  point,
  close,
  streets,
  label,
  pinLabel,
  describedBy,
  onMove,
}: PinMapProps) {
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [camera, setCamera] = useState<Camera>(() => ({ ...point, scale: close ? CLOSE : FAR }));
  /** Where the pin is while it's being dragged. */
  const [dragged, setDragged] = useState<Point | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      if (width > 0 && height > 0) setSize({ w: Math.round(width), h: Math.round(height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (!size) return <div ref={root} className={styles.pickerMap} />;

  const px = (p: Point) => ({
    x: size.w / 2 + ((p.lng - camera.lng) * cosAt(camera.lat)) / camera.scale,
    y: size.h / 2 - (p.lat - camera.lat) / camera.scale,
  });
  const pointAt = (x: number, y: number): Point => ({
    lat: Number((camera.lat - (y - size.h / 2) * camera.scale).toFixed(6)),
    lng: Number((camera.lng + ((x - size.w / 2) * camera.scale) / cosAt(camera.lat)).toFixed(6)),
  });
  // A pin moved out of sight (by the keys, or from outside) brings the view with it.
  const at = px(point);
  const roomy = size.w >= 120 && size.h >= 120;
  if (roomy && !dragged && (at.x < 24 || at.y < 48 || at.x > size.w - 24 || at.y > size.h - 24)) {
    setCamera({ ...camera, lat: point.lat, lng: point.lng });
  }
  const where = (event: PointerEvent<Element>) => {
    const rect = root.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const shown = px(dragged ?? point);
  // Street names, nearest the middle first, leaving out any that would sit on another.
  const labels: Array<{ name: string; x: number; y: number; half: number }> = [];
  for (const street of streets) {
    const points = street.line.flat();
    const middle = points[Math.floor(points.length / 2)];
    if (!middle) continue;
    const q = px(middle);
    const half = street.name.length * 4;
    if (q.x < half || q.y < 24 || q.x > size.w - half || q.y > size.h - 32) continue;
    const clear = labels.every(
      (other) => Math.abs(other.x - q.x) > other.half + half + 8 || Math.abs(other.y - q.y) > 18,
    );
    if (clear && !labels.some((other) => other.name === street.name)) {
      labels.push({ name: street.name, x: q.x, y: q.y - 8, half });
    }
  }
  const zoom = (factor: number) =>
    setCamera({ lat: point.lat, lng: point.lng, scale: camera.scale * factor });

  return (
    <div ref={root} className={styles.pickerMap}>
      <svg
        width={size.w}
        height={size.h}
        className={styles.pickerSvg}
        role="group"
        aria-label={label}
        onClick={(event) => {
          // A tap on the map puts the pin there (M38): no dragging needed.
          if ((event.target as Element).closest('[data-pin]')) return;
          const rect = root.current!.getBoundingClientRect();
          onMove(pointAt(event.clientX - rect.left, event.clientY - rect.top));
        }}
      >
        <defs>
          <pattern id="picker-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" className={styles.gridLine} />
          </pattern>
        </defs>
        <rect width={size.w} height={size.h} className={styles.land} />
        <rect width={size.w} height={size.h} fill="url(#picker-grid)" />
        <g aria-hidden="true">
          {streets.map((street) =>
            street.line.map((run, i) => (
              <polyline
                key={`${street.name}-${i}`}
                points={run
                  .map((p) => {
                    const q = px(p);
                    return `${q.x},${q.y}`;
                  })
                  .join(' ')}
                className={styles.pickerStreet}
              />
            )),
          )}
          {labels.map((label) => (
            <text key={label.name} x={label.x} y={label.y} className={styles.pickerStreetName}>
              {label.name}
            </text>
          ))}
        </g>
        <g
          data-pin
          transform={`translate(${shown.x} ${shown.y})`}
          className={styles.pickerPin}
          role="button"
          tabIndex={0}
          aria-label={pinLabel}
          aria-describedby={describedBy}
          onKeyDown={(event) => {
            const direction = directionOf(event.key);
            if (!direction) return;
            event.preventDefault();
            onMove(nudge(point, direction, event.shiftKey ? BIG_NUDGE_METRES : NUDGE_METRES));
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            dragging.current = true;
          }}
          onPointerMove={(event) => {
            if (!dragging.current) return;
            const to = where(event);
            setDragged(pointAt(to.x, to.y));
          }}
          onPointerUp={() => {
            dragging.current = false;
            if (dragged) onMove(dragged);
            setDragged(null);
          }}
        >
          {/* 44px to take hold of, around a pin whose tip is the point. */}
          <rect x={-22} y={-44} width={44} height={48} className={styles.hitArea} />
          <path d="M0 0 C -5 -11 -14 -17 -14 -27 a 14 14 0 1 1 28 0 C 14 -17 5 -11 0 0 Z" />
          <circle cx={0} cy={-27} r={5} />
        </g>
      </svg>
      <div className={styles.zoom}>
        <button type="button" aria-label={mapWords.zoomIn} onClick={() => zoom(0.5)}>
          <Plus size={20} strokeWidth={2} aria-hidden="true" />
        </button>
        <button type="button" aria-label={mapWords.zoomOut} onClick={() => zoom(2)}>
          <Minus size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <p className={styles.attribution}>Test map: not Google Maps</p>
    </div>
  );
}

export function PinPicker({
  settings,
  onFailed,
  ...props
}: PinMapProps & { settings: MapSettings; onFailed: () => void }) {
  const page = usePageScheme();
  const scheme = mapScheme(page, settings.provider !== 'google' || Boolean(settings.mapIdDark));
  return (
    <div className={styles.picker} data-map-scheme={scheme}>
      {settings.provider === 'google' ? (
        <GooglePinMap {...props} settings={settings} scheme={scheme} onFailed={onFailed} />
      ) : (
        <StaticPinMap {...props} />
      )}
    </div>
  );
}
