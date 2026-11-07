import { describe, expect, it } from 'vitest';
import {
  approximate,
  bboxAround,
  bboxOf,
  distanceMetres,
  inBBox,
  inIreland,
  pointInPolygon,
} from './geo';

const rathmines = { lat: 53.3225, lng: -6.2655 };
const ranelagh = { lat: 53.3262, lng: -6.2563 };
const cork = { lat: 51.8985, lng: -8.4756 };

describe('M56: search geometry', () => {
  it('measures distance on the ground', () => {
    const d = distanceMetres(rathmines, ranelagh);
    expect(d).toBeGreaterThan(600);
    expect(d).toBeLessThan(800);
    expect(distanceMetres(rathmines, cork) / 1000).toBeGreaterThan(210);
  });

  it('builds a box that contains everything within the radius', () => {
    const box = bboxAround(rathmines, 1000);
    expect(inBBox(ranelagh, box)).toBe(true);
    expect(inBBox(cork, box)).toBe(false);
    expect(bboxOf([rathmines, ranelagh])).toEqual({
      minLat: rathmines.lat,
      maxLat: ranelagh.lat,
      minLng: rathmines.lng,
      maxLng: ranelagh.lng,
    });
  });

  it('M57: finds points inside a drawn shape', () => {
    const square = [
      { lat: 53.31, lng: -6.28 },
      { lat: 53.31, lng: -6.25 },
      { lat: 53.33, lng: -6.25 },
      { lat: 53.33, lng: -6.28 },
    ];
    expect(pointInPolygon(rathmines, square)).toBe(true);
    expect(pointInPolygon(cork, square)).toBe(false);
  });

  it('knows roughly where Ireland is', () => {
    expect(inIreland(cork)).toBe(true);
    expect(inIreland({ lat: 51.5074, lng: -0.1278 })).toBe(false);
  });

  it('M38: an approximate point is within about 150 m and repeatable', () => {
    const shown = approximate(rathmines);
    expect(distanceMetres(rathmines, shown)).toBeLessThan(150);
    expect(approximate(shown)).toEqual(shown);
  });
});
