import { describe, expect, it } from 'vitest';
import { fixtureGazetteer, fixturePlaces } from './fixture';
import { distanceToLineMetres } from './geo';
import { streetAt, streetForAddress, streetName } from './street';

const g = fixtureGazetteer();
const streets = fixturePlaces.filter((p) => p.kind === 'street');
const rathgar = g.bySlug('rathgar')!;
const cork = g.bySlug('cork-city')!;

describe('M38: the pin starts on the street in the address', () => {
  it('reads the street’s name as the place index holds it', () => {
    expect(streetName('Highfield Rd')).toBe('highfield road');
    expect(streetName('Highfield Road')).toBe('highfield road');
    expect(streetName('Seán MacDermott St.')).toBe('sean macdermott street');
    expect(streetName('St. Mary’s Rd')).toBe('saint marys road');
    expect(streetName('Saint Mary’s Road')).toBe('saint marys road');
    expect(streetName('')).toBe('');
  });

  it('finds the address’s street near the home’s area, on the road itself', () => {
    const found = streetForAddress('22 Highfield Rd', streets, rathgar)!;
    expect(found.street.slug).toBe('highfield-road-rathgar-dublin-6');
    expect(distanceToLineMetres(found.point, found.street.line!)).toBeLessThan(1);
  });

  it('chooses the street of that name in the home’s own town, never another’s', () => {
    expect(streetForAddress('Apartment 3, 9 Highfield Road', streets, cork)?.street.slug).toBe(
      'highfield-road-ballintemple-cork',
    );
    // Highfield Road is in Rathgar and in Cork; a home in Galway isn't on either.
    expect(streetForAddress('9 Highfield Road', streets, g.bySlug('galway-city')!)).toBeNull();
    // Nor is a home in Dundrum, though Rathgar's Highfield Road is only 3 km away.
    expect(streetForAddress('9 Highfield Road', streets, g.bySlug('dundrum')!)).toBeNull();
  });

  it('has no start for a street the index doesn’t hold', () => {
    expect(streetForAddress('7 Beechfield Terrace', streets, rathgar)).toBeNull();
    expect(streetForAddress('', streets, rathgar)).toBeNull();
  });

  it('names the street a point is on, within 50 metres', () => {
    const onTheRoad = { lat: 53.3157, lng: -6.2672 };
    expect(streetAt(onTheRoad, streets)?.name).toBe('Highfield Road');
    expect(streetAt({ lat: 53.3225, lng: -6.2655 }, streets)).toBeNull();
  });
});
