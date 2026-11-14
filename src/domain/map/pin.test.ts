import { describe, expect, it } from 'vitest';
import { fixtureGazetteer } from '@/domain/places/fixture';
import { distanceMetres } from '@/domain/places/geo';
import { BIG_NUDGE_METRES, NUDGE_METRES, directionOf, nudge, pinInArea, placeAt } from './pin';

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
