import { describe, expect, it } from 'vitest';
import { filtersFromParams, filtersToParams, searchHref, wholeSearch } from './filters';
import { searchHomes, type SearchableHome } from './match';
import { fixtureGazetteer } from '@/domain/places/fixture';
import {
  addCorner,
  inShapes,
  MAX_SHAPE_POINTS,
  midpoints,
  moveCorner,
  nearestTo,
  readShapes,
  removeCorner,
  sensibleShape,
  shapeFromTrace,
  shapesBox,
  writeShapes,
  type Shape,
} from './shapes';

/** A square of about 2 km round Rathgar, and a triangle in Cork city. */
const rathgar: Shape = [
  { lat: 53.32, lng: -6.285 },
  { lat: 53.32, lng: -6.255 },
  { lat: 53.305, lng: -6.255 },
  { lat: 53.305, lng: -6.285 },
];
const cork: Shape = [
  { lat: 51.905, lng: -8.49 },
  { lat: 51.905, lng: -8.45 },
  { lat: 51.885, lng: -8.47 },
];

const home = (id: string, point: SearchableHome['point']): SearchableHome => ({
  id,
  addressLine1: '1 Test Road',
  addressLine2: null,
  area: 'Rathgar',
  county: 'Dublin',
  eircode: null,
  point,
  rentCents: 200_000,
  availableFrom: '2026-12-01',
  propertyType: 'apartment',
  bedrooms: 2,
  furnished: null,
  parking: null,
  criteria: null,
  liveAt: new Date('2026-11-01T10:00:00Z'),
});

describe('drawn areas (UX-SR-13)', () => {
  it('UX-SR-13: a drawn area survives its trip through a search’s address', () => {
    const text = writeShapes([rathgar, cork]);
    expect(readShapes(text)).toEqual([rathgar, cork]);
    const filters = filtersFromParams({ draw: text, beds: '2' });
    expect(filters.shapes).toEqual([rathgar, cork]);
    expect(filtersFromParams(Object.fromEntries(filtersToParams(filters)))).toEqual(filters);
    expect(searchHref(filters)).toContain('draw=');
  });

  it('UX-SR-13: a search has a place, a map area or drawn areas, and only one', () => {
    const box = { minLat: 53.3, minLng: -6.3, maxLat: 53.35, maxLng: -6.2 };
    const whole = wholeSearch({ where: 'ranelagh', within: 1, box, shapes: [rathgar] });
    expect(whole).toEqual({ shapes: [rathgar] });
    expect(wholeSearch({ where: 'ranelagh', box })).toEqual({ box });
  });

  it('UX-SR-13: what isn’t a drawn area is left out, and the rest of the search works', () => {
    expect(readShapes('not a shape')).toBeNull();
    expect(readShapes('')).toBeNull();
    // Two corners; a speck; somewhere that isn't Ireland; six areas.
    expect(readShapes(writeShapes([rathgar.slice(0, 2)]))).toBeNull();
    expect(
      sensibleShape([
        { lat: 53.3, lng: -6.26 },
        { lat: 53.30001, lng: -6.26 },
        { lat: 53.3, lng: -6.26001 },
      ]),
    ).toBe(false);
    expect(sensibleShape(rathgar.map((p) => ({ lat: p.lat - 10, lng: p.lng })))).toBe(false);
    expect(
      readShapes(
        Array(6)
          .fill(writeShapes([rathgar]))
          .join('.'),
      ),
    ).toBeNull();
    expect(filtersFromParams({ draw: 'nonsense', beds: '2' })).toEqual({ beds: 2 });
  });

  it('UX-SR-13: a home is in the search when its pin is inside any drawn area', () => {
    expect(inShapes({ lat: 53.31, lng: -6.27 }, [rathgar, cork])).toBe(true);
    expect(inShapes({ lat: 51.9, lng: -8.47 }, [rathgar, cork])).toBe(true);
    expect(inShapes({ lat: 53.34, lng: -6.26 }, [rathgar, cork])).toBe(false);
    const homes = [
      home('in', { lat: 53.31, lng: -6.27 }),
      home('out', { lat: 53.34, lng: -6.26 }),
      // A home whose pin isn't placed can't be in a drawn area.
      home('nopin', null),
    ];
    const found = searchHomes(homes, { shapes: [rathgar] }, fixtureGazetteer());
    expect(found.fits.map((h) => h.id)).toEqual(['in']);
    expect(found.close).toEqual([]);
  });

  it('UX-SR-13: a line traced by hand becomes a shape with few enough corners', () => {
    // A circle of 400 points, about 1 km across.
    const trace = Array.from({ length: 400 }, (_, i) => {
      const angle = (i / 400) * 2 * Math.PI;
      return { lat: 53.31 + Math.sin(angle) * 0.005, lng: -6.27 + Math.cos(angle) * 0.008 };
    });
    const shape = shapeFromTrace(trace, 15)!;
    expect(shape.length).toBeGreaterThanOrEqual(8);
    expect(shape.length).toBeLessThanOrEqual(MAX_SHAPE_POINTS);
    expect(inShapes({ lat: 53.31, lng: -6.27 }, [shape])).toBe(true);
    expect(inShapes({ lat: 53.32, lng: -6.27 }, [shape])).toBe(false);
    // A slip of the finger isn't an area.
    expect(shapeFromTrace(trace.slice(0, 2), 15)).toBeNull();
    expect(
      shapeFromTrace(
        trace.map((p) => ({ lat: 53.31 + (p.lat - 53.31) / 500, lng: -6.27 })),
        15,
      ),
    ).toBeNull();
  });

  it('UX-SR-13: a corner can be moved, added and removed, and the shape stays an area', () => {
    const moved = moveCorner(rathgar, 0, { lat: 53.325, lng: -6.29 })!;
    expect(moved[0]).toEqual({ lat: 53.325, lng: -6.29 });
    expect(moved).toHaveLength(4);
    // Onto its neighbour: refused, and the shape stays as it was.
    expect(moveCorner(rathgar, 0, rathgar[1]!)).toBeNull();

    const mid = midpoints(rathgar);
    expect(mid).toHaveLength(4);
    const added = addCorner(rathgar, 0, { lat: 53.325, lng: -6.27 })!;
    expect(added).toHaveLength(5);
    expect(added[1]).toEqual({ lat: 53.325, lng: -6.27 });

    expect(removeCorner(added, 1)).toEqual(rathgar);
    // A triangle can't lose a corner.
    expect(removeCorner(cork, 0)).toBeNull();
  });

  it('UX-SR-13: the map shows all the drawn areas, and they are named by the nearest area', () => {
    const box = shapesBox([rathgar, cork]);
    expect(box.minLat).toBe(51.885);
    expect(box.maxLat).toBe(53.32);
    const g = fixtureGazetteer();
    const areas = g.places.filter((p) => p.kind === 'area');
    expect(nearestTo([rathgar], areas)?.name).toBe('Rathgar');
  });
});
