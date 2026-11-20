import { describe, expect, it } from 'vitest';
import { fixtureGazetteer } from '@/domain/places/fixture';
import { bboxAreaKm2, IRELAND, inBBox, type BBox } from '@/domain/places/geo';
import { MAX_BBOX_KM2, readBBox, writeBBox } from '@/domain/search/filters';
import { searchPlace } from '@/domain/search/places';
import {
  cameraKey,
  clampToIreland,
  MAP_BOUNDS,
  mapAreaOf,
  sameBox,
  shouldFit,
  startBox,
  type MapArea,
} from './camera';

const g = fixtureGazetteer();
const area = (slug: string, within?: number) => mapAreaOf(searchPlace(slug, g, within), null);
const rathmines = area('rathmines');
const kinsale = area('kinsale');
const view: BBox = { minLat: 53.3, minLng: -6.3, maxLat: 53.34, maxLng: -6.22 };
const mapArea = (box: BBox): MapArea => mapAreaOf(null, box);

describe('M127: the map moves by itself only when the search area changes', () => {
  it('has one key for an area, whatever else the search holds', () => {
    // The page makes a new area object for every search; the key is what stays the same.
    expect(cameraKey(area('rathmines'))).toBe(cameraKey(rathmines));
    expect(cameraKey(mapAreaOf(null, null))).toBe('everywhere');
    expect(cameraKey(area('dublin'))).toBe('place:dublin');
  });

  it('changes the key with the place, the distance and the map area', () => {
    const street = 'highfield-road-rathgar-dublin-6';
    const keys = [
      cameraKey(rathmines),
      cameraKey(kinsale),
      cameraKey(area(street)),
      cameraKey(area(street, 2)),
      cameraKey(mapArea(view)),
      cameraKey(mapArea({ ...view, maxLat: 53.35 })),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('doesn’t fit when only a filter changed', () => {
    expect(shouldFit(cameraKey(rathmines), area('rathmines'), null)).toBe(false);
  });

  it('fits a new place, a new distance, and the first search', () => {
    expect(shouldFit(null, rathmines, null)).toBe(true);
    expect(shouldFit(cameraKey(rathmines), kinsale, null)).toBe(true);
    const street = 'highfield-road-rathgar-dublin-6';
    expect(shouldFit(cameraKey(area(street)), area(street, 3), null)).toBe(true);
  });

  it('leaves the map where the renter put it after they searched the area', () => {
    // The address keeps five decimal places: the box comes back rounded.
    const asked = readBBox(writeBBox({ ...view, minLat: 53.3000049 }))!;
    expect(shouldFit(cameraKey(rathmines), mapArea(asked), view)).toBe(false);
  });

  it('fits a map area the renter didn’t just make: a shared link, or Back', () => {
    expect(shouldFit(null, mapArea(view), null)).toBe(true);
    const elsewhere = { minLat: 51.8, minLng: -8.6, maxLat: 51.95, maxLng: -8.3 };
    expect(shouldFit(cameraKey(mapArea(view)), mapArea(elsewhere), view)).toBe(true);
  });

  it('fits the place again when the map area is cleared', () => {
    expect(shouldFit(cameraKey(mapArea(view)), rathmines, view)).toBe(true);
  });

  it('tells boxes apart beyond the rounding of a web address', () => {
    expect(sameBox(view, { ...view, maxLng: view.maxLng + 0.00001 })).toBe(true);
    expect(sameBox(view, { ...view, maxLng: view.maxLng + 0.0001 })).toBe(false);
  });
});

describe('M57: where the map starts and how far it reaches', () => {
  it('starts on the place and its distance, the map area, or all of Ireland', () => {
    expect(startBox(mapAreaOf(null, null))).toEqual(IRELAND);
    expect(inBBox({ lat: 53.3225, lng: -6.2655 }, startBox(rathmines))).toBe(true);
    expect(startBox(mapArea(view))).toEqual(view);
    expect(inBBox({ lat: 53.35, lng: -6.26 }, startBox(area('dublin')))).toBe(true);
    // A street is shown with the distance around it.
    const near = startBox(area('highfield-road-rathgar-dublin-6', 3));
    expect(inBBox({ lat: 53.3336, lng: -6.264 }, near)).toBe(true);
  });

  it('keeps a zoomed-out view to the island, so a map area is never too big to search', () => {
    const europe = { minLat: 35, minLng: -25, maxLat: 65, maxLng: 30 };
    const clamped = clampToIreland(europe)!;
    expect(clamped).toEqual(IRELAND);
    expect(bboxAreaKm2(clamped)).toBeLessThan(MAX_BBOX_KM2);
    // The address codec takes it back whole.
    expect(readBBox(writeBBox(clamped))).toEqual(IRELAND);
    expect(readBBox(writeBBox(clampToIreland(MAP_BOUNDS)!))).not.toBeNull();
  });

  it('leaves a view inside Ireland alone, and has nothing for a view that misses it', () => {
    expect(clampToIreland(view)).toEqual(view);
    expect(clampToIreland({ minLat: 48, minLng: 2, maxLat: 49, maxLng: 3 })).toBeNull();
    expect(clampToIreland({ minLat: 53, minLng: -5.2, maxLat: 54, maxLng: -4 })).toBeNull();
  });
});
