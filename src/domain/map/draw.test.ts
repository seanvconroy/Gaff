import { describe, expect, it } from 'vitest';
import type { Point } from '@/domain/places/geo';
import { MAX_SHAPE_POINTS, readShape, writeShape } from '@/domain/search/url';
import { canFinish, closesShape, isTap, shapeFromOutline } from './draw';

/** A circle of points round Rathmines, like a finger's outline. */
function circle(radiusDegrees: number, points: number, centre = { lat: 53.3225, lng: -6.2655 }) {
  return Array.from({ length: points }, (_, i): Point => {
    const angle = (i / points) * 2 * Math.PI;
    return {
      lat: centre.lat + radiusDegrees * Math.sin(angle),
      lng: centre.lng + radiusDegrees * 1.7 * Math.cos(angle),
    };
  });
}

describe('M128: drawing an area without dragging', () => {
  it('tells a tap (a corner) from a drag (a freehand outline)', () => {
    expect(isTap({ x: 100, y: 100, at: 0 }, { x: 103, y: 102, at: 150 })).toBe(true);
    expect(isTap({ x: 100, y: 100, at: 0 }, { x: 140, y: 100, at: 150 })).toBe(false);
    // A long press that doesn't move is the start of a drag that never happened: not a corner.
    expect(isTap({ x: 100, y: 100, at: 0 }, { x: 100, y: 100, at: 900 })).toBe(false);
  });

  it('finishes when the first corner is tapped again, once there are three corners', () => {
    const first = { x: 200, y: 200 };
    expect(closesShape(3, first, { x: 210, y: 195 })).toBe(true);
    expect(closesShape(2, first, { x: 200, y: 200 })).toBe(false);
    expect(closesShape(5, first, { x: 300, y: 200 })).toBe(false);
    expect(canFinish(2)).toBe(false);
    expect(canFinish(3)).toBe(true);
  });

  it('makes a shape from three tapped corners', () => {
    const shape = shapeFromOutline([
      { lat: 53.31, lng: -6.28 },
      { lat: 53.33, lng: -6.28 },
      { lat: 53.33, lng: -6.25 },
    ]);
    expect(shape.ok && shape.polygon).toHaveLength(3);
    expect(shape.ok && shape.box).toEqual({
      minLat: 53.31,
      maxLat: 53.33,
      minLng: -6.28,
      maxLng: -6.25,
    });
  });
});

describe('M56: an outline becomes a shape the web address can hold', () => {
  it('simplifies a long freehand outline to what the address allows', () => {
    const shape = shapeFromOutline(circle(0.01, 900));
    expect(shape.ok).toBe(true);
    if (!shape.ok) return;
    expect(shape.polygon.length).toBeLessThanOrEqual(MAX_SHAPE_POINTS);
    expect(shape.polygon.length).toBeGreaterThan(8);
    // The address codec reads back what it was given.
    expect(readShape(writeShape(shape.polygon))).toHaveLength(shape.polygon.length);
  });

  it('refuses an outline that encloses nothing', () => {
    expect(shapeFromOutline([])).toEqual({ ok: false, problem: 'too_small' });
    expect(shapeFromOutline([{ lat: 53.3, lng: -6.2 }])).toEqual({
      ok: false,
      problem: 'too_small',
    });
    // A line there and back.
    expect(
      shapeFromOutline([
        { lat: 53.3, lng: -6.2 },
        { lat: 53.31, lng: -6.2 },
        { lat: 53.3, lng: -6.2 },
      ]),
    ).toEqual({ ok: false, problem: 'too_small' });
  });

  it('refuses a shape bigger than a search can be, or one that leaves Ireland', () => {
    expect(shapeFromOutline(circle(0.6, 60, { lat: 53.4, lng: -7.9 }))).toEqual({
      ok: false,
      problem: 'too_big',
    });
    expect(shapeFromOutline(circle(0.05, 40, { lat: 53.4, lng: -5.25 }))).toEqual({
      ok: false,
      problem: 'outside',
    });
  });
});
