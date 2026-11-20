import { describe, expect, it } from 'vitest';
import { fixtureGazetteer } from '@/domain/places/fixture';
import { distanceMetres } from '@/domain/places/geo';
import {
  BIG_NUDGE_METRES,
  NUDGE_METRES,
  addressArea,
  directionOf,
  nudge,
  pinInArea,
  placeAt,
  placedPoint,
  pointToSave,
  publicPoint,
} from './pin';

describe('M125: only a placed point goes on the map', () => {
  it('has a point only when both halves and where it came from are known', () => {
    expect(placedPoint({ latitude: 53.3, longitude: -6.2, pointSource: 'letter' })).toEqual({
      lat: 53.3,
      lng: -6.2,
    });
    expect(placedPoint({ latitude: 53.3, longitude: -6.2, pointSource: null })).toBeNull();
    expect(placedPoint({ latitude: null, longitude: -6.2, pointSource: 'letter' })).toBeNull();
  });

  it('saves a point in Ireland, to six places, and nothing else', () => {
    expect(pointToSave({ lat: 53.31571234, lng: -6.26721234 })).toEqual({
      lat: 53.315712,
      lng: -6.267212,
    });
    expect(pointToSave({ lat: 48.85, lng: 2.35 })).toBeNull();
    expect(pointToSave({ lat: Number.NaN, lng: -6.2 })).toBeNull();
    expect(pointToSave({ lat: Infinity, lng: -6.2 })).toBeNull();
  });

  it('never pins a private landlord’s home to its door: renters see it within about 150 m', () => {
    const door = { lat: 53.315712, lng: -6.267212 };
    const seen = publicPoint(door, 'private_landlord');
    expect(seen).not.toEqual(door);
    expect(distanceMetres(seen, door)).toBeLessThan(150);
    // Two doors on one street land on the same point: the map can't tell them apart.
    expect(publicPoint(nudge(door, 'east', 10), 'private_landlord')).toEqual(seen);
    expect(publicPoint(door, 'agency')).toEqual(door);
    expect(publicPoint(door, 'landlord')).toEqual(door);
  });
});

describe('M38: where the pin starts is the area the address names', () => {
  const home = (area: string, addressLine1 = '12 Highfield Road', county = 'Dublin') => ({
    addressLine1,
    addressLine2: null,
    area,
    county,
    eircode: null,
  });

  it('reads the most specific area in the address, in its county', () => {
    expect(addressArea(home('Rathgar, Dublin 6'), g)?.slug).toBe('rathgar');
    expect(addressArea(home('Ranelagh, Dublin 6'), g)?.slug).toBe('ranelagh');
    expect(addressArea(home('Kinsale', '3 Main Street', 'Cork'), g)?.slug).toBe('kinsale');
  });

  it('has none for an area the index doesn’t know, or one in another county', () => {
    expect(addressArea(home('Nowhere in particular'), g)).toBeNull();
    expect(addressArea(home('Kinsale', '3 Main Street', 'Kerry'), g)).toBeNull();
  });
});

const g = fixtureGazetteer();
const rathgar = g.bySlug('rathgar')!;
const rathmines = g.bySlug('rathmines')!;
const onHighfieldRoad = { lat: 53.3157, lng: -6.2672 };

describe('M38: the pin moves without dragging', () => {
  it('moves about 10 metres for an arrow key, and 50 with Shift, in each direction', () => {
    for (const direction of ['north', 'south', 'east', 'west'] as const) {
      const small = distanceMetres(
        onHighfieldRoad,
        nudge(onHighfieldRoad, direction, NUDGE_METRES),
      );
      const big = distanceMetres(
        onHighfieldRoad,
        nudge(onHighfieldRoad, direction, BIG_NUDGE_METRES),
      );
      expect(small).toBeGreaterThan(9);
      expect(small).toBeLessThan(11);
      expect(big).toBeGreaterThan(48);
      expect(big).toBeLessThan(52);
    }
    expect(nudge(onHighfieldRoad, 'north', 10).lat).toBeGreaterThan(onHighfieldRoad.lat);
    expect(nudge(onHighfieldRoad, 'east', 10).lng).toBeGreaterThan(onHighfieldRoad.lng);
  });

  it('comes back to where it started', () => {
    const there = nudge(onHighfieldRoad, 'west', BIG_NUDGE_METRES);
    expect(distanceMetres(onHighfieldRoad, nudge(there, 'east', BIG_NUDGE_METRES))).toBeLessThan(
      0.2,
    );
  });

  it('reads the arrow keys, and nothing else', () => {
    expect(directionOf('ArrowUp')).toBe('north');
    expect(directionOf('ArrowLeft')).toBe('west');
    expect(directionOf('Enter')).toBeNull();
    expect(directionOf('w')).toBeNull();
  });
});

describe('M126: a pin outside the address’s area is worth a check', () => {
  it('is inside when it’s in the area, or just past its edge', () => {
    expect(pinInArea(onHighfieldRoad, rathgar)).toBe(true);
    expect(pinInArea(rathgar.centre, rathgar)).toBe(true);
    // Rathgar's centre is over a kilometre from Rathmines's: just inside its edge, with the margin.
    expect(pinInArea(nudge(rathmines.centre, 'north', 1400), rathmines)).toBe(true);
  });

  it('is outside when it’s in another area or another town', () => {
    expect(pinInArea(g.bySlug('ranelagh')!.centre, rathgar)).toBe(false);
    expect(pinInArea(g.bySlug('kinsale')!.centre, rathgar)).toBe(false);
  });

  it('names the area a point sits deepest inside, before its Dublin district', () => {
    expect(placeAt(onHighfieldRoad, g.places)?.name).toBe('Rathgar');
    // Areas overlap: a point beside Rathmines' centre is in Rathmines, whichever areas reach it.
    const besideRathmines = nudge(rathmines.centre, 'west', 180);
    expect(placeAt(besideRathmines, g.places)?.name).toBe('Rathmines');
    const smallNeighbour = {
      ...rathmines,
      slug: 'small-neighbour',
      name: 'Small neighbour',
      centre: nudge(rathmines.centre, 'west', 700),
      radiusMetres: 900,
    };
    expect(placeAt(besideRathmines, [...g.places, smallNeighbour])?.name).toBe('Rathmines');
    expect(placeAt(g.bySlug('kinsale')!.centre, g.places)?.name).toBe('Kinsale');
    // The middle of the Irish Sea is nowhere Gaff knows.
    expect(placeAt({ lat: 53.5, lng: -5.4 }, g.places)).toBeNull();
  });

  it('names the area before the city around it, however near the city’s centre', () => {
    const cork = g.bySlug('cork-city')!;
    const point = nudge(cork.centre, 'east', 1500);
    expect(placeAt(point, [cork])).toBe(cork);
    // The point is at the area's edge, and well inside the city: the area still says more.
    const area = {
      ...cork,
      slug: 'an-area-in-cork',
      name: 'An area in Cork',
      kind: 'area' as const,
      centre: nudge(point, 'east', 700),
      radiusMetres: 800,
    };
    expect(placeAt(point, [cork, area])?.name).toBe('An area in Cork');
    expect(placeAt(point, [area, cork])?.name).toBe('An area in Cork');
  });

  it('falls back to the Dublin district when no area holds the point', () => {
    const districts = g.places.filter((p) => p.kind === 'district');
    expect(placeAt(onHighfieldRoad, districts)?.kind).toBe('district');
  });
});
