import { describe, expect, it } from 'vitest';
import { fixtureGazetteer } from '@/domain/places/fixture';
import { bboxAreaKm2, IRELAND, inBBox, type BBox } from '@/domain/places/geo';
import { nearArea, searchArea, type SearchArea } from '@/domain/search/places';
import { MAX_BBOX_KM2, readBBox, writeBBox } from '@/domain/search/url';
import { cameraKey, clampToIreland, MAP_BOUNDS, sameBox, shouldFit, startBox } from './camera';

const g = fixtureGazetteer();
const rathmines = searchArea('rathmines', g)!;
const kinsale = searchArea('kinsale', g)!;
const view: BBox = { minLat: 53.3, minLng: -6.3, maxLat: 53.34, maxLng: -6.22 };
const mapArea = (box: BBox, from = rathmines): SearchArea => ({ kind: 'map', box, from });

describe('M127: the map moves by itself only when the search area changes', () => {
  it('has one key for an area, whatever else the search holds', () => {
    // The page makes a new area object for every search; the key is what stays the same.
    expect(cameraKey(searchArea('rathmines', g)!)).toBe(cameraKey(rathmines));
    expect(cameraKey({ kind: 'everywhere' })).toBe('everywhere');
    expect(cameraKey(searchArea('dublin', g)!)).toBe('county:dublin');
    expect(cameraKey(searchArea('dublin-6', g)!)).toBe('key:D06');
  });

  it('changes the key with the place, the distance, the map area and the shape', () => {
    const street = g.bySlug('highfield-road-rathgar-dublin-6')!;
    const keys = [
      cameraKey(rathmines),
      cameraKey(kinsale),
      cameraKey(searchArea('kinsale', g, 3)!),
      cameraKey(nearArea(street, g)),
      cameraKey(nearArea(street, g, 2)),
      cameraKey(mapArea(view)),
      cameraKey(mapArea({ ...view, maxLat: 53.35 })),
      cameraKey({
        kind: 'shape',
        polygon: [
          { lat: 53.3, lng: -6.3 },
          { lat: 53.34, lng: -6.3 },
          { lat: 53.34, lng: -6.22 },
        ],
        box: view,
        from: rathmines,
      }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('doesn’t fit when only a filter, the order or the page changed', () => {
    expect(shouldFit(cameraKey(rathmines), searchArea('rathmines', g)!, null)).toBe(false);
  });

  it('fits a new place, a new distance, and the first search', () => {
    expect(shouldFit(null, rathmines, null)).toBe(true);
    expect(shouldFit(cameraKey(rathmines), kinsale, null)).toBe(true);
    expect(shouldFit(cameraKey(kinsale), searchArea('kinsale', g, 3)!, null)).toBe(true);
  });

  it('leaves the map where the renter put it after they moved it', () => {
    // The address keeps five decimal places: the box comes back rounded.
    const asked = readBBox(writeBBox({ ...view, minLat: 53.3000049 }))!;
    expect(shouldFit(cameraKey(rathmines), mapArea(asked), view)).toBe(false);
  });

  it('fits a map area the renter didn’t just make: a shared link, or Back', () => {
    expect(shouldFit(null, mapArea(view), null)).toBe(true);
    const elsewhere = { minLat: 51.8, minLng: -8.6, maxLat: 51.95, maxLng: -8.3 };
    expect(shouldFit(cameraKey(mapArea(view)), mapArea(elsewhere), view)).toBe(true);
  });

  it('fits the place again when the map area or shape is cleared', () => {
    expect(shouldFit(cameraKey(mapArea(view)), rathmines, view)).toBe(true);
  });

  it('tells boxes apart beyond the rounding of a web address', () => {
    expect(sameBox(view, { ...view, maxLng: view.maxLng + 0.00001 })).toBe(true);
    expect(sameBox(view, { ...view, maxLng: view.maxLng + 0.0001 })).toBe(false);
  });
});

describe('M57: where the map starts and how far it reaches', () => {
  it('starts on the place and its distance, or all of Ireland', () => {
    expect(startBox({ kind: 'everywhere' })).toEqual(IRELAND);
    expect(inBBox({ lat: 53.3225, lng: -6.2655 }, startBox(rathmines))).toBe(true);
    expect(startBox(mapArea(view))).toEqual(view);
    const dublin = startBox(searchArea('dublin', g)!);
    expect(inBBox({ lat: 53.35, lng: -6.26 }, dublin)).toBe(true);
  });

  it('keeps a zoomed-out view to the island, so a map area is never too big to search', () => {
    const europe = { minLat: 35, minLng: -25, maxLat: 65, maxLng: 30 };
    const clamped = clampToIreland(europe)!;
    expect(clamped).toEqual(IRELAND);
    expect(bboxAreaKm2(clamped)).toBeLessThan(MAX_BBOX_KM2);
    // The address codec takes it back whole.
    expect(readBBox(writeBBox(clamped))).toEqual(IRELAND);
    // The bounds the map is held to are always worth searching.
    expect(readBBox(writeBBox(clampToIreland(MAP_BOUNDS)!))).not.toBeNull();
  });

  it('leaves a view inside Ireland alone, and has nothing for a view that misses it', () => {
    expect(clampToIreland(view)).toEqual(view);
    expect(clampToIreland({ minLat: 48, minLng: 2, maxLat: 49, maxLng: 3 })).toBeNull();
    // A view over the Irish Sea, east of the island's box.
    expect(clampToIreland({ minLat: 53, minLng: -5.2, maxLat: 54, maxLng: -4 })).toBeNull();
  });
});
