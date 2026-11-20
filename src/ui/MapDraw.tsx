'use client';

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { distanceMetres, IRELAND, type Point } from '@/domain/places/geo';
import {
  addCorner,
  clampPoint,
  midpoints,
  MIN_SHAPE_POINTS,
  moveCorner,
  removeCorner,
  sensibleShape,
  shapeFromTrace,
  type Shape,
} from '@/domain/search/shapes';
import type { MapProjection } from './map-types';
import styles from './MapDraw.module.css';

/**
 * Drawing on the map (section 8, "Map"; UX-SR-13): the areas a renter draws to search, and
 * the corners they reshape them by. One layer over the map, the same for every map provider: it
 * is given a way to turn places into positions (`MapProjection`) and draws in the map's own box.
 *
 * - Drawing: press and trace a loop, and it closes when the finger or mouse lifts. Or tap each
 *   corner in turn, and tap the first again (or press Finish) to close it. Or, with a keyboard,
 *   press Enter for a square to reshape. No dragging is ever the only way (WCAG 2.5.7).
 * - Reshaping: the chosen area shows its corners. Drag a corner to move it; drag the small dot
 *   half way along a side to pull out a new corner; double-click a corner, or press Delete on
 *   it, to take it away. The arrow keys move the corner in focus.
 *
 * Every change is handed up when the hand lifts (`onReshape`), never part-way: the page searches
 * once for each. Only an outline and its corners take the pointer, so pins inside an area still
 * open.
 */

interface Pixel {
  x: number;
  y: number;
}

/** A press that moves less than this is a tap, not a trace. */
const TAP_PX = 10;
/** A tap this close to the first corner closes the shape. */
const CLOSE_PX = 18;
/** A traced line keeps its shape to within this, on screen. */
const TRACE_TOLERANCE_PX = 8;
/** How far an arrow key moves a corner, and with Shift held. */
const KEY_STEP_PX = 8;
const KEY_BIG_STEP_PX = 40;

export interface MapDrawHandle {
  /** Closes the shape whose corners were tapped, if there are enough of them. */
  finish: () => void;
}

export interface MapDrawWords {
  surface: string;
  shape: (n: number, of: number) => string;
  corner: (n: number, of: number) => string;
  addCorner: string;
}

export function MapDraw({
  ref,
  projection,
  shapes,
  selected,
  drawing,
  words,
  onDrawn,
  onTooSmall,
  onCancel,
  onTaps,
  onReshape,
  onSelect,
}: {
  ref?: Ref<MapDrawHandle>;
  /** Null until the map has a view: nothing is drawn before then. */
  projection: MapProjection | null;
  shapes: readonly Shape[];
  /** The area being reshaped: the one that shows its corners. */
  selected: number | null;
  drawing: boolean;
  words: MapDrawWords;
  /** A new area was drawn. */
  onDrawn: (shape: Shape) => void;
  /** What was traced was too small to be an area. */
  onTooSmall: () => void;
  /** Escape, while drawing. */
  onCancel: () => void;
  /** How many corners have been tapped so far: three or more can be finished. */
  onTaps: (count: number) => void;
  /** An area was reshaped: a corner moved, added or removed. */
  onReshape: (index: number, shape: Shape) => void;
  onSelect: (index: number) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  /** A loop being traced, in pixels; a ref beside it so pointer events never read a stale one. */
  const [trace, setTrace] = useState<Pixel[] | null>(null);
  const tracing = useRef<Pixel[] | null>(null);
  /** Corners tapped one by one. */
  const [taps, setTaps] = useState<Point[]>([]);
  /** A corner being dragged: the area as it would be if the hand lifted now. */
  const [preview, setPreview] = useState<{ index: number; shape: Shape } | null>(null);
  /** Lets go of a corner that is in hand: set while one is. */
  const stopDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDrag.current?.(), []);

  const setTapped = (next: Point[]) => {
    setTaps(next);
    onTaps(next.length);
  };

  const finishTaps = (corners: Point[] = taps) => {
    if (corners.length < MIN_SHAPE_POINTS) return;
    setTapped([]);
    if (sensibleShape(corners)) onDrawn(corners);
    else onTooSmall();
  };
  useImperativeHandle(ref, () => ({ finish: () => finishTaps() }));

  // Leaving drawing mode lets go of whatever was part-drawn.
  const [wasDrawing, setWasDrawing] = useState(drawing);
  if (wasDrawing !== drawing) {
    setWasDrawing(drawing);
    if (!drawing) {
      setTrace(null);
      setTaps([]);
    }
  }

  if (!projection) return null;
  const { toPixel, toPoint } = projection;

  const at = (event: { clientX: number; clientY: number }): Pixel => {
    const box = svg.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  const pointAt = (pixel: Pixel): Point => clampPoint(toPoint(pixel.x, pixel.y), IRELAND);
  const path = (points: readonly Point[]) =>
    points
      .map((point) => {
        const p = toPixel(point);
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      })
      .join(' ');

  /** How many metres one pixel covers, here and now. */
  const metresPerPixel = () => distanceMetres(toPoint(0, 0), toPoint(100, 0)) / 100;

  // Drawing: a trace, or a tap for each corner.
  const startTrace = (event: ReactPointerEvent<SVGRectElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    tracing.current = [at(event)];
    setTrace(tracing.current);
  };
  const moveTrace = (event: ReactPointerEvent<SVGRectElement>) => {
    const line = tracing.current;
    if (!line) return;
    const next = at(event);
    const last = line[line.length - 1]!;
    if (Math.hypot(next.x - last.x, next.y - last.y) < 3) return;
    tracing.current = [...line, next];
    setTrace(tracing.current);
  };
  const endTrace = (event: ReactPointerEvent<SVGRectElement>) => {
    const line = tracing.current;
    if (!line) return;
    tracing.current = null;
    setTrace(null);
    const end = at(event);
    const start = line[0]!;
    const reach = Math.max(...line.map((p) => Math.hypot(p.x - start.x, p.y - start.y)));
    if (reach < TAP_PX) {
      // A tap: one more corner, or the first corner again to close the shape.
      const first = taps[0] ? toPixel(taps[0]) : null;
      if (
        first &&
        taps.length >= MIN_SHAPE_POINTS &&
        Math.hypot(end.x - first.x, end.y - first.y) <= CLOSE_PX
      ) {
        finishTaps();
      } else {
        setTapped([...taps, pointAt(end)]);
      }
      return;
    }
    const shape = shapeFromTrace(line.map(pointAt), TRACE_TOLERANCE_PX * metresPerPixel());
    setTapped([]);
    if (shape) onDrawn(shape);
    else onTooSmall();
  };
  const drawingKey = (event: ReactKeyboardEvent<SVGRectElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (taps.length >= MIN_SHAPE_POINTS) {
        finishTaps();
        return;
      }
      // The keyboard's way in: a square in the middle of the view, to reshape by its corners.
      const box = svg.current!.getBoundingClientRect();
      const half = Math.min(box.width, box.height) * 0.25;
      const cx = box.width / 2;
      const cy = box.height / 2;
      const square = [
        { x: cx - half, y: cy - half },
        { x: cx + half, y: cy - half },
        { x: cx + half, y: cy + half },
        { x: cx - half, y: cy + half },
      ].map(pointAt);
      if (sensibleShape(square)) onDrawn(square);
      else onTooSmall();
    }
  };

  // Reshaping: a corner, or the dot half way along a side that becomes one. The drag is followed
  // on the window, so it carries on when the pointer leaves the corner, or the dot it began on
  // is redrawn as a corner.
  const startDrag = (
    event: ReactPointerEvent<SVGGElement>,
    index: number,
    corner: number,
    base: Shape,
  ) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.stopPropagation();
    event.preventDefault();
    stopDrag.current?.();
    let moved = false;
    const move = (e: PointerEvent) => {
      moved = true;
      const to = pointAt(at(e));
      setPreview({ index, shape: base.map((point, i) => (i === corner ? to : point)) });
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', stop);
      stopDrag.current = null;
      setPreview(null);
    };
    const end = (e: PointerEvent) => {
      stop();
      if (!moved) return;
      // What can't be an area (a corner dropped on its neighbour) leaves the area as it was.
      const shape = moveCorner(base, corner, pointAt(at(e)));
      if (shape) onReshape(index, shape);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', stop);
    stopDrag.current = stop;
  };
  const cornerKey = (event: ReactKeyboardEvent<SVGGElement>, index: number, corner: number) => {
    const shape = shapes[index]!;
    const step = event.shiftKey ? KEY_BIG_STEP_PX : KEY_STEP_PX;
    const by: Record<string, Pixel> = {
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
    };
    const move = by[event.key];
    if (move) {
      event.preventDefault();
      const from = toPixel(shape[corner]!);
      const moved = moveCorner(shape, corner, pointAt({ x: from.x + move.x, y: from.y + move.y }));
      if (moved) onReshape(index, moved);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      const left = removeCorner(shape, corner);
      if (left) onReshape(index, left);
    }
  };

  const shown = shapes.map((shape, i) => (preview?.index === i ? preview.shape : shape));
  const tapped = taps.map(toPixel);

  return (
    <svg ref={svg} className={styles.layer} data-drawing={drawing || undefined}>
      {shown.map((shape, i) => {
        const chosen = selected === i && !drawing;
        return (
          <g key={i} data-shape={i} data-selected={chosen || undefined}>
            <polygon points={path(shape)} className={styles.shape} />
            {/* The outline is what's pressed to choose an area: its inside is left to the pins. */}
            {!drawing && !chosen ? (
              <polygon
                points={path(shape)}
                className={styles.outlineHit}
                role="button"
                tabIndex={0}
                aria-label={words.shape(i + 1, shapes.length)}
                onClick={() => onSelect(i)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(i);
                  }
                }}
              />
            ) : null}
            {chosen
              ? midpoints(shape).map((mid, side) => {
                  // Not while a corner is in hand: the dots would chase it.
                  if (preview) return null;
                  const p = toPixel(mid);
                  const withCorner = addCorner(shape, side, mid);
                  if (!withCorner) return null;
                  return (
                    <g
                      key={`mid-${side}`}
                      className={styles.handle}
                      data-kind="mid"
                      role="button"
                      tabIndex={0}
                      aria-label={words.addCorner}
                      transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
                      onPointerDown={(event) => startDrag(event, i, side + 1, withCorner)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onReshape(i, withCorner);
                        }
                      }}
                    >
                      <circle r={14} className={styles.hit} />
                      <circle r={4} className={styles.mid} />
                    </g>
                  );
                })
              : null}
            {chosen
              ? shape.map((corner, c) => {
                  const p = toPixel(corner);
                  return (
                    <g
                      key={`corner-${c}`}
                      className={styles.handle}
                      data-kind="corner"
                      role="button"
                      tabIndex={0}
                      aria-label={words.corner(c + 1, shape.length)}
                      transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
                      onPointerDown={(event) => startDrag(event, i, c, shapes[i]!)}
                      onDoubleClick={() => {
                        const left = removeCorner(shapes[i]!, c);
                        if (left) onReshape(i, left);
                      }}
                      onKeyDown={(event) => cornerKey(event, i, c)}
                    >
                      <circle r={22} className={styles.hit} />
                      <circle r={7} className={styles.corner} />
                    </g>
                  );
                })
              : null}
          </g>
        );
      })}

      {drawing ? (
        <>
          <rect
            width="100%"
            height="100%"
            className={styles.surface}
            role="application"
            tabIndex={0}
            aria-label={words.surface}
            // The surface takes the keyboard as drawing starts, so Enter and Escape work at once.
            ref={(element) => {
              if (element && document.activeElement !== element && !tracing.current) {
                element.focus({ preventScroll: true });
              }
            }}
            onPointerDown={startTrace}
            onPointerMove={moveTrace}
            onPointerUp={endTrace}
            onPointerCancel={() => {
              tracing.current = null;
              setTrace(null);
            }}
            onDoubleClick={() => finishTaps()}
            onKeyDown={drawingKey}
          />
          {trace && trace.length > 1 ? (
            <polyline
              points={trace.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
              className={styles.trace}
            />
          ) : null}
          {tapped.length > 1 ? (
            <polyline
              points={tapped.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
              className={styles.trace}
            />
          ) : null}
          {tapped.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={i === 0 && tapped.length >= MIN_SHAPE_POINTS ? 9 : 6}
              className={styles.tapped}
              data-first={i === 0 || undefined}
            />
          ))}
        </>
      ) : null}
    </svg>
  );
}
