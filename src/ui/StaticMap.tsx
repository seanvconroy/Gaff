'use client';

import { Minus, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { clusterName, mapWords, pinLabel, pinName } from '@/copy/map';
import { groupOf, homesIn, type PinGroup } from '@/domain/map/points';
import type { BBox, Point } from '@/domain/places/geo';
import type { MapProviderProps } from './map-types';
import styles from './SearchMap.module.css';

/**
 * The stand-in search map for tests, development and any copy without a Google key
 * (MAP_PROVIDER=static; the live line's ADR-0027). Plain SVG on a grid, drawn at the size of its
 * box, with the same behaviour as the real map: pins with the rent, pins for homes that share a
 * point, clusters, zoom buttons, dragging to move, and the searched street drawn on it. It fits a
 * search only when asked to, and a change of size is never the renter's move (M127). Never in
 * production.
 */

const CLUSTER_PX = 72;
const FIT_PADDING = 24;
/** The least a view shows: a few streets. */
const MIN_SPAN = 0.004;

interface Size {
  w: number;
  h: number;
}

/** The middle of the view, and how many degrees of latitude one pixel covers. */
interface Camera {
  lat: number;
  lng: number;
  scale: number;
}

const cosAt = (lat: number) => Math.cos((lat * Math.PI) / 180);

function cameraFor(box: BBox, size: Size): Camera {
  const lat = (box.minLat + box.maxLat) / 2;
  const lng = (box.minLng + box.maxLng) / 2;
  const tall = Math.max(MIN_SPAN, box.maxLat - box.minLat);
  const wide = Math.max(MIN_SPAN, box.maxLng - box.minLng) * cosAt(lat);
  return {
    lat,
    lng,
    scale: Math.max(
      tall / Math.max(1, size.h - 2 * FIT_PADDING),
      wide / Math.max(1, size.w - 2 * FIT_PADDING),
    ),
  };
}

function boxOf(camera: Camera, size: Size): BBox {
  const dLat = (camera.scale * size.h) / 2;
  const dLng = (camera.scale * size.w) / 2 / cosAt(camera.lat);
  return {
    minLat: camera.lat - dLat,
    maxLat: camera.lat + dLat,
    minLng: camera.lng - dLng,
    maxLng: camera.lng + dLng,
  };
}

export function StaticMap({
  fit,
  groups,
  hovered,
  chosen,
  onHover,
  onChoose,
  onMoved,
  onProjection,
  area,
  onReady,
}: MapProviderProps) {
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [at, setAt] = useState<{ fitId: number; camera: Camera } | null>(null);
  /** While the renter drags: the view follows the pointer, and the page hears when they let go. */
  const [dragging, setDragging] = useState<Camera | null>(null);
  const drag = useRef<{ x: number; y: number; camera: Camera; to: Camera | null } | null>(null);
  /** Set by the renter's own moves, just before the view changes (M127). */
  const byRenter = useRef(false);
  const callbacks = useRef({ onMoved, onReady, onProjection });

  useEffect(() => {
    callbacks.current = { onMoved, onReady, onProjection };
  });

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

  // M127: the map fits a search when the page asks (a new `fit`), and at no other time.
  if (size && (!at || at.fitId !== fit.id)) {
    setAt({ fitId: fit.id, camera: cameraFor(fit.box, size) });
  }
  const settled = at?.camera ?? null;
  const camera = dragging ?? settled;
  const ready = settled !== null;

  useEffect(() => {
    if (ready) callbacks.current.onReady();
  }, [ready]);

  // Every change of view is told to the page: the renter's own moves, the page's fits, and a
  // change of size, which is never the renter's.
  useEffect(() => {
    if (!settled || !size) return;
    callbacks.current.onMoved(boxOf(settled, size), byRenter.current);
    byRenter.current = false;
  }, [settled, size]);

  // UX-SR-13: what is drawn over the map follows every change of view, a drag's included.
  useEffect(() => {
    if (!camera || !size) return;
    const cos = cosAt(camera.lat);
    callbacks.current.onProjection({
      toPixel: (point) => ({
        x: size.w / 2 + ((point.lng - camera.lng) * cos) / camera.scale,
        y: size.h / 2 - (point.lat - camera.lat) / camera.scale,
      }),
      toPoint: (x, y) => ({
        lat: camera.lat - (y - size.h / 2) * camera.scale,
        lng: camera.lng + ((x - size.w / 2) * camera.scale) / cos,
      }),
    });
  }, [camera, size]);

  const move = (next: Camera) => {
    byRenter.current = true;
    setAt((current) => (current ? { ...current, camera: next } : current));
  };

  const clusters = useMemo(() => {
    if (!camera || !size) return [];
    const found: Array<{ x: number; y: number; groups: PinGroup[] }> = [];
    for (const group of groups) {
      const x = size.w / 2 + ((group.lng - camera.lng) * cosAt(camera.lat)) / camera.scale;
      const y = size.h / 2 - (group.lat - camera.lat) / camera.scale;
      const near = found.find((c) => Math.hypot(c.x - x, c.y - y) < CLUSTER_PX);
      if (near) near.groups.push(group);
      else found.push({ x, y, groups: [group] });
    }
    return found;
  }, [groups, camera, size]);

  if (!camera || !size) return <div ref={root} className={styles.staticMap} />;

  const px = (point: Point) => ({
    x: size.w / 2 + ((point.lng - camera.lng) * cosAt(camera.lat)) / camera.scale,
    y: size.h / 2 - (point.lat - camera.lat) / camera.scale,
  });
  const metres = (m: number) => m / 111_320 / camera.scale;
  const path = (points: readonly Point[]) =>
    points
      .map((point) => {
        const p = px(point);
        return `${p.x},${p.y}`;
      })
      .join(' ');
  const zoom = (factor: number, around?: Point) => {
    const centre = around ?? camera;
    move({
      lat: centre.lat - (centre.lat - camera.lat) * factor,
      lng: centre.lng - (centre.lng - camera.lng) * factor,
      scale: camera.scale * factor,
    });
  };

  // The home being looked at, when its pin is inside a cluster: shown above the cluster.
  const lit = [groupOf(groups, chosen), groupOf(groups, hovered)].filter(
    (group, i, all): group is PinGroup => group !== null && all.indexOf(group) === i,
  );
  const raised = lit.filter((group) =>
    clusters.some((c) => c.groups.length > 1 && c.groups.includes(group)),
  );
  const isLit = (group: PinGroup) => lit.includes(group);
  const pinWidth = (label: string) => Math.max(64, label.length * 10 + 28);

  return (
    <div ref={root} className={styles.staticMap}>
      <svg
        width={size.w}
        height={size.h}
        className={styles.staticSvg}
        role="group"
        aria-label={mapWords.label}
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const where = { x: event.clientX - rect.left, y: event.clientY - rect.top };
          if (
            event.target === event.currentTarget ||
            (event.target as Element).tagName === 'rect'
          ) {
            drag.current = { ...where, camera, to: null };
            // A drag that leaves the map still ends on it, as on a real map.
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const where = { x: event.clientX - rect.left, y: event.clientY - rect.top };
          const start = drag.current;
          // The page hears of the move when the drag ends, as when a real map comes to rest.
          start.to = {
            ...start.camera,
            lat: start.camera.lat + (where.y - start.y) * start.camera.scale,
            lng:
              start.camera.lng -
              ((where.x - start.x) * start.camera.scale) / cosAt(start.camera.lat),
          };
          setDragging(start.to);
        }}
        onPointerUp={() => {
          if (!drag.current) return;
          const { to } = drag.current;
          drag.current = null;
          setDragging(null);
          if (to) move(to);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(null);
        }}
      >
        <defs>
          <pattern id="static-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" className={styles.gridLine} />
          </pattern>
        </defs>
        <rect width={size.w} height={size.h} className={styles.land} />
        <rect width={size.w} height={size.h} fill="url(#static-grid)" />
        {area.kind === 'near'
          ? (area.line ?? []).map((run, i) => (
              <polyline key={i} points={path(run)} className={styles.street} />
            ))
          : null}
        {area.kind === 'near' ? (
          <circle
            cx={px(area.centre).x}
            cy={px(area.centre).y}
            r={metres(area.withinMetres)}
            className={styles.outline}
          />
        ) : null}
        {clusters.map((cluster) => {
          if (cluster.groups.length > 1) {
            const homes = homesIn(cluster.groups);
            const middle = { lat: cluster.groups[0]!.lat, lng: cluster.groups[0]!.lng };
            return (
              <g
                key={cluster.groups.map((g) => g.key).join('-')}
                transform={`translate(${cluster.x} ${cluster.y})`}
                className={styles.staticCluster}
                role="button"
                tabIndex={0}
                aria-label={clusterName(homes)}
                onClick={() => zoom(0.5, middle)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    zoom(0.5, middle);
                  }
                }}
              >
                <circle r={24} />
                <text textAnchor="middle" dominantBaseline="central">
                  {homes}
                </text>
              </g>
            );
          }
          const group = cluster.groups[0]!;
          const label = pinLabel(group);
          const width = pinWidth(label);
          const first = group.homes[0]!.id;
          return (
            <g
              key={group.key}
              transform={`translate(${cluster.x} ${cluster.y})`}
              className={styles.staticPin}
              data-on={isLit(group) || undefined}
              data-homes={group.homes.length}
              role="button"
              tabIndex={0}
              aria-label={pinName(group)}
              aria-pressed={group.homes.some((home) => home.id === chosen)}
              onClick={() => onChoose(group)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onChoose(group);
                }
              }}
              onPointerEnter={() => onHover(first)}
              onPointerLeave={() => onHover(null)}
              onFocus={() => onHover(first)}
              onBlur={() => onHover(null)}
            >
              {/* M117: 44px to tap, though the pill looks smaller. */}
              <rect x={-width / 2} y={-22} width={width} height={44} className={styles.hitArea} />
              <rect x={-width / 2} y={-17} width={width} height={34} rx={17} />
              <text textAnchor="middle" dominantBaseline="central">
                {label}
              </text>
            </g>
          );
        })}
        {raised.map((group) => {
          const label = pinLabel(group);
          const width = pinWidth(label);
          const p = px(group);
          return (
            <g
              key={`raised-${group.key}`}
              transform={`translate(${p.x} ${p.y - 34})`}
              className={styles.staticPin}
              data-on
              data-raised
              aria-hidden="true"
            >
              <rect x={-width / 2} y={-17} width={width} height={34} rx={17} />
              <text textAnchor="middle" dominantBaseline="central">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className={styles.zoom}>
        <button type="button" aria-label={mapWords.zoomIn} onClick={() => zoom(0.5)}>
          <Plus size={20} strokeWidth={2} aria-hidden="true" />
        </button>
        <button type="button" aria-label={mapWords.zoomOut} onClick={() => zoom(2)}>
          <Minus size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <p className={styles.standIn}>{mapWords.standIn}</p>
    </div>
  );
}
