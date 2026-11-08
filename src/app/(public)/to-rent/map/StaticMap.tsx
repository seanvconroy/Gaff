'use client';

import { Minus, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { BBox, Point } from '@/domain/places/geo';
import { pinLabel, type MapPin, type MapProviderProps } from './types';
import styles from './map.module.css';

/**
 * ADR-0025: the stand-in map for tests and development without a Google key (MAP_PROVIDER=
 * static). Plain SVG on a grid, with the same behaviour as the real map: pins with the rent,
 * clusters, zoom, dragging to search the area in view, drawing an outline, and the searched
 * area drawn on it. Never in production.
 */

const W = 1000;
const H = 700;
const CLUSTER_PX = 80;

/** A view with the map's shape, around a box (with a little room). */
function fitView(box: BBox): BBox {
  const midLat = (box.minLat + box.maxLat) / 2;
  const midLng = (box.minLng + box.maxLng) / 2;
  const cos = Math.cos((midLat * Math.PI) / 180);
  let latSpan = Math.max(0.004, (box.maxLat - box.minLat) * 1.15);
  let lngSpan = Math.max(0.004, (box.maxLng - box.minLng) * 1.15);
  if (lngSpan * cos * H > latSpan * W) latSpan = (lngSpan * cos * H) / W;
  else lngSpan = (latSpan * W) / (H * cos);
  return {
    minLat: midLat - latSpan / 2,
    maxLat: midLat + latSpan / 2,
    minLng: midLng - lngSpan / 2,
    maxLng: midLng + lngSpan / 2,
  };
}

function zoom(view: BBox, factor: number, at?: Point): BBox {
  const c = at ?? { lat: (view.minLat + view.maxLat) / 2, lng: (view.minLng + view.maxLng) / 2 };
  return {
    minLat: c.lat - (c.lat - view.minLat) * factor,
    maxLat: c.lat + (view.maxLat - c.lat) * factor,
    minLng: c.lng - (c.lng - view.minLng) * factor,
    maxLng: c.lng + (view.maxLng - c.lng) * factor,
  };
}

export function StaticMap({
  startBox,
  pins,
  hovered,
  chosen,
  onHover,
  onChoose,
  onMoved,
  drawing,
  onDrawn,
  area,
}: MapProviderProps) {
  const [view, setView] = useState(() => fitView(startBox));
  const [outline, setOutline] = useState<Point[]>([]);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; view: BBox } | null>(null);

  const x = (lng: number) => ((lng - view.minLng) / (view.maxLng - view.minLng)) * W;
  const y = (lat: number) => ((view.maxLat - lat) / (view.maxLat - view.minLat)) * H;

  /** Screen pixels to map units, then to a point. */
  function pointAt(event: PointerEvent<SVGSVGElement>): Point {
    const rect = svg.current!.getBoundingClientRect();
    // The map fills its box ("slice"), so the larger scale applies.
    const scale = Math.max(rect.width / W, rect.height / H);
    const offsetX = (rect.width - W * scale) / 2;
    const offsetY = (rect.height - H * scale) / 2;
    const ux = (event.clientX - rect.left - offsetX) / scale;
    const uy = (event.clientY - rect.top - offsetY) / scale;
    return {
      lng: view.minLng + (ux / W) * (view.maxLng - view.minLng),
      lat: view.maxLat - (uy / H) * (view.maxLat - view.minLat),
    };
  }

  // The page's own view (a new search remounts this map) isn't the renter's move.
  useEffect(() => {
    onMoved(view, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = (next: BBox) => {
    setView(next);
    onMoved(next, true);
  };

  const clusters = useMemo(() => {
    const groups: Array<{ x: number; y: number; pins: MapPin[] }> = [];
    for (const pin of pins) {
      const px = x(pin.lng);
      const py = y(pin.lat);
      const near = groups.find((g) => Math.hypot(g.x - px, g.y - py) < CLUSTER_PX);
      if (near && !near.pins.some((p) => p.id === chosen || p.id === hovered)) {
        near.pins.push(pin);
      } else {
        groups.push({ x: px, y: py, pins: [pin] });
      }
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, view, chosen, hovered]);

  const metresToUnits = (m: number, lat: number) =>
    (m / (111_320 * Math.cos((lat * Math.PI) / 180))) * (W / (view.maxLng - view.minLng));

  return (
    <div className={styles.staticMap}>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        className={styles.staticSvg}
        data-drawing={drawing || undefined}
        role="group"
        aria-label="Map of the homes in this search"
        onPointerDown={(event) => {
          if (drawing) {
            event.currentTarget.setPointerCapture(event.pointerId);
            setOutline([pointAt(event)]);
          } else if (
            event.target === event.currentTarget ||
            (event.target as Element).tagName === 'rect'
          ) {
            drag.current = { x: event.clientX, y: event.clientY, view };
          }
        }}
        onPointerMove={(event) => {
          if (drawing && outline.length) {
            setOutline((o) => [...o, pointAt(event)]);
          } else if (drag.current) {
            const rect = svg.current!.getBoundingClientRect();
            const start = drag.current.view;
            const dx =
              ((event.clientX - drag.current.x) / rect.width) * (start.maxLng - start.minLng);
            const dy =
              ((event.clientY - drag.current.y) / rect.height) * (start.maxLat - start.minLat);
            setView({
              minLat: start.minLat + dy,
              maxLat: start.maxLat + dy,
              minLng: start.minLng - dx,
              maxLng: start.maxLng - dx,
            });
          }
        }}
        onPointerUp={() => {
          if (drawing && outline.length) {
            onDrawn(outline);
            setOutline([]);
          } else if (drag.current) {
            const moved = drag.current.view !== view;
            drag.current = null;
            if (moved) onMoved(view, true);
          }
        }}
      >
        <defs>
          <pattern id="static-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" className={styles.gridLine} />
          </pattern>
        </defs>
        <rect width={W} height={H} className={styles.land} />
        <rect width={W} height={H} fill="url(#static-grid)" />
        {area.kind === 'radius' ? (
          <circle
            cx={x(area.centre.lng)}
            cy={y(area.centre.lat)}
            r={metresToUnits(area.radiusMetres, area.centre.lat)}
            className={styles.outline}
          />
        ) : null}
        {area.kind === 'near' && area.place.line
          ? area.place.line.map((run, i) => (
              <polyline
                key={i}
                points={run.map((p) => `${x(p.lng)},${y(p.lat)}`).join(' ')}
                className={styles.street}
              />
            ))
          : null}
        {area.kind === 'near' ? (
          <circle
            cx={x(area.place.centre.lng)}
            cy={y(area.place.centre.lat)}
            r={metresToUnits(area.withinKm * 1000, area.place.centre.lat)}
            className={styles.outline}
          />
        ) : null}
        {area.kind === 'shape' ? (
          <polygon
            points={area.polygon.map((p) => `${x(p.lng)},${y(p.lat)}`).join(' ')}
            className={styles.outline}
          />
        ) : null}
        {outline.length > 1 ? (
          <polyline
            points={outline.map((p) => `${x(p.lng)},${y(p.lat)}`).join(' ')}
            className={styles.drawn}
          />
        ) : null}
        {clusters.map((group) =>
          group.pins.length > 1 ? (
            <g
              key={group.pins.map((p) => p.id).join('-')}
              transform={`translate(${group.x} ${group.y})`}
              className={styles.staticCluster}
              role="button"
              tabIndex={0}
              aria-label={`${group.pins.length} homes here: zoom in`}
              onClick={() =>
                move(zoom(view, 0.5, { lat: group.pins[0]!.lat, lng: group.pins[0]!.lng }))
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  move(zoom(view, 0.5, { lat: group.pins[0]!.lat, lng: group.pins[0]!.lng }));
                }
              }}
            >
              <circle r={30} />
              <text textAnchor="middle" dominantBaseline="central" fontSize={26}>
                {group.pins.length}
              </text>
            </g>
          ) : (
            <g
              key={group.pins[0]!.id}
              transform={`translate(${group.x} ${group.y})`}
              className={styles.staticPin}
              data-on={group.pins[0]!.id === chosen || group.pins[0]!.id === hovered || undefined}
              role="button"
              tabIndex={0}
              aria-label={`${pinLabel(group.pins[0]!.rentCents)} a month, ${group.pins[0]!.title}`}
              aria-pressed={group.pins[0]!.id === chosen}
              onClick={() => onChoose(group.pins[0]!.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onChoose(group.pins[0]!.id);
                }
              }}
              onPointerEnter={() => onHover(group.pins[0]!.id)}
              onPointerLeave={() => onHover(null)}
              onFocus={() => onHover(group.pins[0]!.id)}
              onBlur={() => onHover(null)}
            >
              <rect x={-58} y={-22} width={116} height={44} rx={22} />
              <text textAnchor="middle" dominantBaseline="central" fontSize={24}>
                {pinLabel(group.pins[0]!.rentCents)}
              </text>
            </g>
          ),
        )}
      </svg>
      <div className={styles.zoom}>
        <button type="button" aria-label="Zoom in" onClick={() => move(zoom(view, 0.5))}>
          <Plus size={20} strokeWidth={2} aria-hidden="true" />
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => move(zoom(view, 2))}>
          <Minus size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <p className={styles.attribution}>Test map: not Google Maps</p>
    </div>
  );
}
