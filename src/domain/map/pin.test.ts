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

  it('names the smallest area that holds a point, before its Dublin district', () => {
    expect(placeAt(onHighfieldRoad, g.places)?.name).toBe('Rathgar');
    expect(placeAt(g.bySlug('kinsale')!.centre, g.places)?.name).toBe('Kinsale');
    // The middle of the Irish Sea is nowhere Gaff knows.
    expect(placeAt({ lat: 53.5, lng: -5.4 }, g.places)).toBeNull();
  });

  it('falls back to the Dublin district when no area holds the point', () => {
    const districts = g.places.filter((p) => p.kind === 'district');
    expect(placeAt(onHighfieldRoad, districts)?.kind).toBe('district');
  });
});
